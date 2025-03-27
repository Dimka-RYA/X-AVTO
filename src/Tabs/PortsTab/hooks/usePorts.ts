import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Port } from '../types';

/**
 * Хук для работы с сетевыми портами
 * Обеспечивает загрузку, обновление и закрытие портов
 */
export const usePorts = () => {
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingPorts, setClosingPorts] = useState<Set<string>>(new Set());
  
  // Флаг для отслеживания видимости компонента
  const isVisibleRef = useRef(true);
  const lastUpdateRef = useRef<number>(0);
  // Используем только ref для отслеживания состояния загрузки
  const fetchingRef = useRef<boolean>(false);
  // Счетчик запросов для ограничения частоты логирования
  const requestCountRef = useRef<number>(0);
  // Флаг инициализации для поочередной загрузки
  const initialLoadRef = useRef<boolean>(true);
  // Флаг, был ли хотя бы один успешно полученный ответ по событию
  const receivedPortsEventRef = useRef<boolean>(false);

  // Прослушивание событий ports-data от бэкенда
  useEffect(() => {
    console.log('[usePorts] Настройка прослушивания events ports-data');
    
    const unlisten = listen<Port[]>('ports-data', (event) => {
      console.log('[usePorts] Получено событие ports-data:', event);
      
      const portsData = event.payload;
      
      if (!portsData || !Array.isArray(portsData)) {
        console.error('[usePorts] Ошибка: получены некорректные данные:', portsData);
        return;
      }
      
      console.log(`[usePorts] Получено ${portsData.length} портов через событие`);
      
      if (portsData.length > 0) {
        receivedPortsEventRef.current = true;
        console.log('[usePorts] Пример первого порта из события:', JSON.stringify(portsData[0]));
        
        // Обновляем состояние только если данные изменились
        setPorts(currentPorts => {
          // Если данные не изменились, не обновляем состояние
          if (currentPorts.length === portsData.length && 
              comparePortsData(portsData, currentPorts)) {
            console.log('[usePorts] Данные от события не изменились, состояние не обновляется');
            return currentPorts;
          }
          
          console.log(`[usePorts] Обновляем порты из события: ${portsData.length} портов (было ${currentPorts.length})`);
          return portsData;
        });
        
        // Сбрасываем состояние загрузки и ошибки
        if (loading) {
          console.log('[usePorts] Сбрасываем состояние loading в false (из события)');
          setLoading(false);
        }
        
        if (error) {
          setError(null);
        }
        
        // Обновляем время последнего обновления
        lastUpdateRef.current = Date.now();
      }
    });
    
    // Отписываемся при размонтировании компонента
    return () => {
      console.log('[usePorts] Отписываемся от событий ports-data');
      unlisten.then(unsubscribe => unsubscribe());
    };
  }, [loading, error]);

  // Следим за видимостью компонента
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      
      // Если вкладка стала видимой и данные устарели, обновляем их
      if (isVisibleRef.current && Date.now() - lastUpdateRef.current > 60000) {
        fetchPorts(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Функция для сравнения различий в коллекциях портов
  const comparePortsData = useCallback((newPorts: Port[], oldPorts: Port[]): boolean => {
    // Оптимизированное сравнение с использованием Map для быстрого поиска
    const oldPortsMap = new Map<string, Port>();
    
    // Создаем Map для быстрого доступа к старым портам по уникальному ключу
    oldPorts.forEach(port => {
      // Используем комбинацию PID, адреса и протокола как уникальный ключ
      oldPortsMap.set(
        `${port.pid}-${port.local_addr}-${port.protocol}`, port
      );
    });
    
    // Сравниваем каждый новый порт со старым
    for (const newPort of newPorts) {
      const key = `${newPort.pid}-${newPort.local_addr}-${newPort.protocol}`;
      const oldPort = oldPortsMap.get(key);
      
      // Если порта не было в старом списке или данные изменились, коллекции различаются
      if (!oldPort || 
          newPort.state !== oldPort.state ||
          newPort.foreign_addr !== oldPort.foreign_addr ||
          newPort.name !== oldPort.name) {
        return false; // Найдено различие
      }
      
      // Удаляем порт из Map, чтобы в конце проверить, остались ли старые порты, которых нет в новом списке
      oldPortsMap.delete(key);
    }
    
    // Если в старом списке остались порты, которых нет в новом, коллекции различаются
    return oldPortsMap.size === 0;
  }, []);

  // Мемоизированная функция для получения данных о портах
  const fetchPorts = useCallback(async (showLoading = false) => {
    // Если уже идет загрузка или прошло менее 5 секунд с последнего обновления, не делаем запрос (увеличили с 3 до 5 сек)
    if (fetchingRef.current || (!showLoading && Date.now() - lastUpdateRef.current < 5000)) return;
    
    try {
      // Увеличиваем счетчик запросов
      requestCountRef.current++;
      const shouldLog = true; // Всегда логируем для отладки
      
      // Устанавливаем рефы до обновления состояния для предотвращения мигания и повторных запросов
      fetchingRef.current = true;
      
      if (shouldLog) {
        console.log(`[usePorts] Запрос данных о портах (запрос #${requestCountRef.current})`);
        console.log('[usePorts] Текущее состояние loading:', loading);
      }

      if (showLoading && !loading) {
        console.log('[usePorts] Устанавливаем состояние loading в true');
        setLoading(true);
      }
      
      // Используем асинхронный API с таймаутом
      console.log('[usePorts] Вызываем invoke "get_network_ports"');
      
      // Создаем промис с таймаутом
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Превышено время ожидания запроса (10 секунд)")), 10000)
      );
      
      // Создаем промис для invoke
      const invokePromise = invoke<Port[]>('get_network_ports', { forceUpdate: true });
      
      // Запускаем оба промиса и берем тот, который выполнится первым
      const data = await Promise.race([invokePromise, timeoutPromise]) as Port[];
      
      console.log('[usePorts] Получен ответ от get_network_ports, количество портов:', data ? data.length : 0);
      
      if (!data || !Array.isArray(data)) {
        console.error('[usePorts] Ошибка: Полученные данные не являются массивом', data);
        throw new Error('Полученные данные не являются массивом');
      }
      
      if (data.length > 0) {
        console.log('[usePorts] Пример первого порта:', JSON.stringify(data[0]));
      } else {
        console.log('[usePorts] Получен пустой массив портов');
        // Пробуем альтернативный метод обновления
        console.log('[usePorts] Пробуем обновить через refresh_ports_command');
        try {
          const refreshResult = await invoke('refresh_ports_command', { detailedLogging: true });
          console.log('[usePorts] Результат refresh_ports_command:', refreshResult);
        } catch (refreshError) {
          console.error('[usePorts] Ошибка при вызове refresh_ports_command:', refreshError);
        }
      }
      
      lastUpdateRef.current = Date.now();
      
      // Оптимизация: сравниваем данные перед обновлением состояния
      const portsEqual = comparePortsData(data, ports);
      console.log('[usePorts] Данные изменились?', !portsEqual);
      
      // Только если данные действительно изменились или это первая загрузка
      if (!portsEqual || ports.length === 0) {
        // При первичной загрузке, если много портов, загружаем поочередно
        if (initialLoadRef.current && data.length > 100) {
          if (shouldLog) {
            console.log(`[usePorts] Поочередная загрузка ${data.length} портов`);
          }
          
          // Устанавливаем начальный набор (первые 30 портов)
          const initialBatch = data.slice(0, 30);
          console.log('[usePorts] Устанавливаем начальный пакет:', initialBatch.length);
          setPorts(initialBatch);
          
          // Затем добавляем остальные порты в несколько этапов
          const batchSize = 50;
          const batches = Math.ceil((data.length - 30) / batchSize);
          
          for (let i = 0; i < batches; i++) {
            const startIdx = 30 + (i * batchSize);
            const endIdx = Math.min(startIdx + batchSize, data.length);
            
            setTimeout(() => {
              setPorts(prevPorts => {
                const newBatch = [...prevPorts, ...data.slice(startIdx, endIdx)];
                if (shouldLog) {
                  console.log(`[usePorts] Загружен пакет ${i+1}/${batches}: порты ${startIdx}-${endIdx}`);
                }
                return newBatch;
              });
              
              // Когда загрузили последний пакет, сбрасываем флаг
              if (endIdx === data.length) {
                initialLoadRef.current = false;
                if (shouldLog) {
                  console.log('[usePorts] Завершена поочередная загрузка всех портов');
                }
              }
            }, 100 + (i * 150)); // Увеличиваем задержку для каждого пакета
          }
        } else {
          // Обычное обновление для последующих запросов
          console.log('[usePorts] Устанавливаем порты:', data.length);
          setPorts(data);
          if (shouldLog && data.length !== ports.length) {
            console.log(`[usePorts] Обновлены данные: ${data.length} портов (было ${ports.length})`);
          }
        }
      } else if (shouldLog) {
        console.log('[usePorts] Данные не изменились, состояние не обновляется');
      }
      
      // Сбрасываем состояние загрузки и ошибки
      console.log('[usePorts] Сбрасываем состояние loading в false');
      setLoading(false);
      
      if (error) setError(null);
    } catch (err) {
      const error = err as Error;
      console.error('[usePorts] Ошибка при получении данных о портах:', error);
      
      // Проверяем, были ли получены данные через события раньше
      if (receivedPortsEventRef.current && ports.length > 0) {
        console.log('[usePorts] У нас уже есть данные из события, игнорируем ошибку');
        if (loading) {
          setLoading(false);
        }
        return;
      }
      
      // Показываем ошибку только если данных нет или явно запрошено отображение
      if (ports.length === 0 || showLoading) {
        setError(`Не удалось загрузить данные о портах: ${error.message || String(error)}`);
        
        // Пробуем получить данные еще раз через refresh_ports_command
        console.log('[usePorts] Пробуем получить данные через refresh_ports_command после ошибки');
        try {
          const result = await invoke('refresh_ports_command', { detailedLogging: true });
          console.log('[usePorts] Результат refresh_ports_command после ошибки:', result);
        } catch (refreshError) {
          console.error('[usePorts] Ошибка при вызове refresh_ports_command после ошибки:', refreshError);
        }
      }
      
      // Временные данные только при первой загрузке и если не было данных из событий
      if (loading && ports.length === 0 && !receivedPortsEventRef.current) {
        console.log('[usePorts] Загружаем временные тестовые данные после ошибки');
        setPorts([
          {
            local_addr: '0.0.0.0:80', 
            protocol: 'TCP', 
            state: 'LISTEN', 
            foreign_addr: '0.0.0.0:0', 
            pid: '4228', 
            name: 'nginx',
            path: ''
          },
          {
            local_addr: '127.0.0.1:3306', 
            protocol: 'TCP', 
            state: 'LISTEN', 
            foreign_addr: '0.0.0.0:0', 
            pid: '1044', 
            name: 'mysqld',
            path: ''
          },
          {
            local_addr: '0.0.0.0:443', 
            protocol: 'TCP', 
            state: 'LISTEN', 
            foreign_addr: '0.0.0.0:0', 
            pid: '4228', 
            name: 'nginx',
            path: ''
          },
          {
            local_addr: '127.0.0.1:8080', 
            protocol: 'TCP', 
            state: 'LISTEN', 
            foreign_addr: '0.0.0.0:0', 
            pid: '5566', 
            name: 'java',
            path: ''
          },
          {
            local_addr: '0.0.0.0:22', 
            protocol: 'TCP', 
            state: 'LISTEN', 
            foreign_addr: '0.0.0.0:0', 
            pid: '854', 
            name: 'sshd',
            path: ''
          },
        ]);
        initialLoadRef.current = false; // Сбрасываем флаг первичной загрузки
        
        console.log('[usePorts] Сбрасываем состояние loading (после ошибки) в false');
        setLoading(false);
      }
    } finally {
      // Очищаем флаги загрузки
      fetchingRef.current = false;
      console.log('[usePorts] fetchingRef установлен в false');
    }
  }, [ports, error, loading, comparePortsData]);

  // Первичная загрузка данных
  useEffect(() => {
    fetchPorts(true);
  }, [fetchPorts]);

  // Периодическое фоновое обновление данных
  useEffect(() => {
    let intervalId: number;
    
    const startPolling = () => {
      // Увеличиваем интервал до 60 секунд для снижения нагрузки (было 45 секунд)
      intervalId = window.setInterval(() => {
        // Обновляем данные только если вкладка активна, не выполняются другие операции и данные не обновлялись недавно
        if (isVisibleRef.current && !fetchingRef.current && closingPorts.size === 0) {
          fetchPorts(false); // Фоновое обновление без индикатора
        }
      }, 60000); // 60 секунд
    };
    
    startPolling();
    
    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [fetchPorts, closingPorts]);

  // Закрытие порта с обработкой ошибок и запрет на параллельные операции
  const closePort = async (pid: string) => {
    if (fetchingRef.current || closingPorts.has(pid)) return; // Предотвращаем множественные запросы
    
    try {
      // Помечаем порт как "в процессе закрытия"
      setClosingPorts(prev => new Set(prev).add(pid));
      
      // Логируем только каждый 5-й запрос на закрытие порта
      const shouldLog = (++requestCountRef.current) % 5 === 0;
      if (shouldLog) {
        console.log(`[usePorts] Закрытие порта с PID ${pid}`);
      }
      
      await invoke('close_port', { pid });
      
      // Немедленно удаляем порт из UI для лучшего UX
      setPorts(prevPorts => prevPorts.filter(port => port.pid !== pid));
      
      // Обновляем данные только если есть другие активные порты
      const remainingPorts = ports.length - 1;
      if (remainingPorts > 0) {
        // Используем отложенное обновление через requestAnimationFrame для лучшей производительности
        window.requestAnimationFrame(() => {
          setTimeout(() => {
            if (!fetchingRef.current) {
              fetchPorts(false);
            }
          }, 1000); // Увеличили с 500 до 1000 мс для снижения нагрузки
        });
      }
    } catch (err) {
      console.error('Ошибка при закрытии порта:', err);
      setError(`Не удалось закрыть порт с PID ${pid}`);
      
      // Автоматически скрываем ошибку через 3 секунды
      setTimeout(() => setError(null), 3000);
    } finally {
      // Удаляем порт из списка "в процессе закрытия"
      setClosingPorts(prev => {
        const newSet = new Set(prev);
        newSet.delete(pid);
        return newSet;
      });
    }
  };

  // Ручное обновление данных
  const refreshPorts = async () => {
    // Предотвращаем повторное нажатие во время загрузки
    if (fetchingRef.current) return;
    
    console.log('[usePorts] Ручное обновление данных');
    
    // Сбрасываем флаг первичной загрузки при ручном обновлении
    initialLoadRef.current = false;
    
    await fetchPorts(true); // С индикатором загрузки
  };

  return {
    ports,
    loading,
    error,
    closingPorts,
    refreshPorts,
    closePort,
    fetchingRef
  };
}; 