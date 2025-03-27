/**
 * Утилиты для форматирования адресов и отображения информации о сетевых соединениях
 */

// Кэш для данных адресов
const addressDetailsCache: Record<string, string> = {};

// Карта известных служб (порт -> имя службы)
export const COMMON_SERVICES: Record<string, string> = {
  '80': 'HTTP',
  '443': 'HTTPS',
  '22': 'SSH',
  '21': 'FTP',
  '25': 'SMTP',
  '110': 'POP3',
  '143': 'IMAP',
  '3306': 'MySQL',
  '5432': 'PostgreSQL',
  '27017': 'MongoDB',
  '6379': 'Redis',
  '1433': 'MSSQL',
  '3389': 'RDP',
  '53': 'DNS',
  '137': 'NetBIOS',
  '138': 'NetBIOS',
  '139': 'NetBIOS',
  '445': 'SMB',
  '8080': 'HTTP-Alt',
  '8443': 'HTTPS-Alt',
  '23': 'Telnet',
  '161': 'SNMP',
  '162': 'SNMP-Trap',
  '389': 'LDAP',
  '636': 'LDAPS',
  '989': 'FTPS-data',
  '990': 'FTPS',
  '1521': 'Oracle',
  '5000': 'Flask/UPnP',
  '5001': 'Flask-SSL/UPnP',
  '3000': 'Dev-Server',
  '5353': 'mDNS',
  '4040': 'Dev-Server'
};

// Карта общеизвестных хостов и IP-адресов (сохраняем полные адреса)
export const COMMON_HOSTS: Record<string, string> = {
  // Сохраняем полные адреса
  '0.0.0.0': '0.0.0.0',
  '127.0.0.1': 'localhost (127.0.0.1)',  // Отображаем и имя, и адрес
  '::': '::',
  '::1': 'localhost (::1)'  // Отображаем и имя, и адрес для IPv6
};

/**
 * Проверяет, является ли адрес полностью пустым
 */
export function isEmptyAddress(address: string | null | undefined): boolean {
  return address === null || address === undefined || address === '' || address.trim() === '';
}

/**
 * Получает название сервиса для заданного порта
 */
export function getServiceName(port: number): string | null {
  return COMMON_SERVICES[port] || null;
}

/**
 * Очистка кэша
 */
export function clearAddressCache(): void {
  console.log('[addressFormatter] Очистка кэша');
  Object.keys(addressDetailsCache).forEach(key => {
    delete addressDetailsCache[key];
  });
}

/**
 * Функция для форматирования сетевого адреса 
 * Просто возвращает оригинальный адрес из netstat
 */
export function formatAddress(address: string): string {
  // Просто возвращаем адрес как есть из netstat
  return address;
}

/**
 * Получение детальной информации об адресе для всплывающей подсказки
 * @param address Адрес
 * @returns Строка с информацией
 */
export function getAddressDetails(address: string): string {
  // Проверка на пустой адрес
  if (!address || address.trim() === '') {
    return 'Пустой адрес';
  }

  // Проверяем, есть ли уже в кэше
  if (addressDetailsCache[address]) {
    return addressDetailsCache[address];
  }

  try {
    const details: string[] = [];
    
    // Добавляем оригинальный адрес
    details.push(`Адрес: ${address}`);
    
    // Получаем IP и порт (для IPv4)
    if (address.includes(':') && !address.includes('[')) {
      const parts = address.split(':');
      const ip = parts[0];
      const port = parts.length > 1 ? parts[1] : '';
      
      // Специальные значения
      if (ip === '0.0.0.0') {
        details.push('Все доступные интерфейсы');
      } else if (ip === '127.0.0.1') {
        details.push('Локальный адрес (localhost)');
      } else if (ip === '*') {
        details.push('Все интерфейсы');
      }
      
      // Информация о порте
      if (port && port !== '*') {
        // Проверяем, известен ли сервис
        const serviceName = COMMON_SERVICES[port];
        if (serviceName) {
          details.push(`Порт ${port} (${serviceName})`);
        } else {
          details.push(`Порт: ${port}`);
        }
      } else if (port === '*') {
        details.push('Все порты');
      }
    }
    // Для IPv6 адресов
    else if (address.includes('[') && address.includes(']')) {
      const match = address.match(/\[(.*?)\]:(\d+)/);
      if (match) {
        const ipv6 = match[1];
        const port = match[2];
        details.push(`IPv6 адрес: ${ipv6}`);
        
        if (port) {
          const serviceName = COMMON_SERVICES[port];
          if (serviceName) {
            details.push(`Порт ${port} (${serviceName})`);
          } else {
            details.push(`Порт: ${port}`);
          }
        }
      } else {
        details.push(`IPv6 адрес без порта`);
      }
    }
    
    // Сохраняем в кэш
    const result = details.join('\n');
    addressDetailsCache[address] = result;
    return result;
  } catch (error) {
    console.error(`Ошибка при получении деталей адреса ${address}:`, error);
    return `Адрес: ${address}`;
  }
} 