using System;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Collections.Generic;

namespace GpuMonitor
{
    public class Program
    {
        public static void Main(string[] args)
        {
            try
            {
                Console.WriteLine("[GPU_CS] Starting GPU Monitor application");
                
                // Путь к DLL
                string dllPath = @"C:\PROJECTS\DIMPLOM\X-Avto\X-AVTO\src-tauri\src\utils\LibreHardwareMonitorLib.dll";
                
                if (!File.Exists(dllPath))
                {
                    Console.WriteLine("[GPU_CS] ERROR: DLL file not found at: " + dllPath);
                    PrintDefaultData();
                    return;
                }
                
                Console.WriteLine("[GPU_CS] Loading LibreHardwareMonitor assembly...");
                
                // Разблокируем файл DLL
                try
                {
                    var fi = new FileInfo(dllPath);
                    fi.UnblockFile();
                    Console.WriteLine("[GPU_CS] File unblocked successfully");
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[GPU_CS] Could not unblock file: " + ex.Message);
                }
                
                // Загружаем сборку
                Assembly libraryAssembly = Assembly.LoadFrom(dllPath);
                
                Console.WriteLine("[GPU_CS] Assembly loaded: " + libraryAssembly.FullName);
                
                // Создаем объект Computer
                Type computerType = libraryAssembly.GetType("LibreHardwareMonitor.Hardware.Computer");
                if (computerType == null)
                {
                    Console.WriteLine("[GPU_CS] ERROR: Cannot find Computer type in the assembly");
                    PrintDefaultData();
                    return;
                }
                
                object computer = Activator.CreateInstance(computerType);
                Console.WriteLine("[GPU_CS] Computer instance created");
                
                // Включаем отслеживание GPU
                PropertyInfo gpuEnabledProperty = computerType.GetProperty("IsGpuEnabled");
                if (gpuEnabledProperty != null)
                {
                    gpuEnabledProperty.SetValue(computer, true);
                    Console.WriteLine("[GPU_CS] GPU monitoring enabled");
                }
                else
                {
                    Console.WriteLine("[GPU_CS] WARNING: IsGpuEnabled property not found");
                }
                
                // Открываем компьютер для мониторинга
                MethodInfo openMethod = computerType.GetMethod("Open");
                if (openMethod != null)
                {
                    openMethod.Invoke(computer, null);
                    Console.WriteLine("[GPU_CS] Computer.Open() method executed");
                }
                else
                {
                    Console.WriteLine("[GPU_CS] ERROR: Open method not found");
                    PrintDefaultData();
                    return;
                }
                
                // Создаем класс для обновления данных через паттерн Visitor
                Type updateVisitorType = libraryAssembly.GetType("LibreHardwareMonitor.Hardware.UpdateVisitor");
                if (updateVisitorType == null)
                {
                    Console.WriteLine("[GPU_CS] ERROR: Cannot find UpdateVisitor type");
                    PrintDefaultData();
                    return;
                }
                
                object updateVisitor = Activator.CreateInstance(updateVisitorType);
                Console.WriteLine("[GPU_CS] UpdateVisitor instance created");
                
                // Вызываем метод Accept для обновления данных
                MethodInfo acceptMethod = computerType.GetMethod("Accept");
                if (acceptMethod != null)
                {
                    acceptMethod.Invoke(computer, new object[] { updateVisitor });
                    Console.WriteLine("[GPU_CS] Accept method executed successfully");
                }
                else
                {
                    Console.WriteLine("[GPU_CS] ERROR: Accept method not found");
                    PrintDefaultData();
                    return;
                }
                
                // Словарь для хранения данных о GPU
                var gpuData = new Dictionary<string, object>
                {
                    { "Name", "No data" },
                    { "Usage", 0.0 },
                    { "Temperature", null },
                    { "MemoryTotal", 0L },
                    { "MemoryUsed", 0L },
                    { "Cores", null },
                    { "Frequency", null },
                    { "MemoryType", "No data" }
                };
                
                int gpuCount = 0;
                
                // Получаем список доступных аппаратных компонентов
                PropertyInfo hardwareProperty = computerType.GetProperty("Hardware");
                if (hardwareProperty != null)
                {
                    object hardwareArray = hardwareProperty.GetValue(computer);
                    
                    // Проверяем, является ли результат массивом или списком
                    if (hardwareArray != null)
                    {
                        Type hardwareArrayType = hardwareArray.GetType();
                        int hardwareCount = (int)hardwareArrayType.GetProperty("Length").GetValue(hardwareArray);
                        Console.WriteLine("[GPU_CS] Found " + hardwareCount + " hardware components");
                        
                        for (int i = 0; i < hardwareCount; i++)
                        {
                            object hardware = hardwareArrayType.GetMethod("get_Item").Invoke(hardwareArray, new object[] { i });
                            PropertyInfo hardwareTypeProperty = hardware.GetType().GetProperty("HardwareType");
                            
                            if (hardwareTypeProperty != null)
                            {
                                object hardwareTypeValue = hardwareTypeProperty.GetValue(hardware);
                                string hardwareTypeName = hardwareTypeValue.ToString();
                                PropertyInfo hardwareNameProperty = hardware.GetType().GetProperty("Name");
                                string hardwareName = hardwareNameProperty != null ? 
                                                    (string)hardwareNameProperty.GetValue(hardware) : "Unknown";
                                                    
                                Console.WriteLine("[GPU_CS] Hardware " + i + ": " + hardwareTypeName + " - " + hardwareName);
                                
                                // Проверяем, является ли устройство видеокартой
                                if (hardwareTypeName.Contains("Gpu"))
                                {
                                    gpuCount++;
                                    Console.WriteLine("[GPU_CS] Found GPU: " + hardwareName);
                                    
                                    // Обновляем имя видеокарты
                                    gpuData["Name"] = hardwareName;
                                    
                                    // Обновляем данные оборудования
                                    MethodInfo updateMethod = hardware.GetType().GetMethod("Update");
                                    if (updateMethod != null)
                                    {
                                        updateMethod.Invoke(hardware, null);
                                        Console.WriteLine("[GPU_CS] Hardware.Update() executed");
                                    }
                                    else
                                    {
                                        Console.WriteLine("[GPU_CS] WARNING: Update method not found");
                                    }
                                    
                                    // Получаем список сенсоров
                                    PropertyInfo sensorsProperty = hardware.GetType().GetProperty("Sensors");
                                    if (sensorsProperty != null)
                                    {
                                        object sensorsArray = sensorsProperty.GetValue(hardware);
                                        Type sensorsArrayType = sensorsArray.GetType();
                                        int sensorsCount = (int)sensorsArrayType.GetProperty("Length").GetValue(sensorsArray);
                                        
                                        Console.WriteLine("[GPU_CS] Found " + sensorsCount + " sensors");
                                        
                                        for (int j = 0; j < sensorsCount; j++)
                                        {
                                            object sensor = sensorsArrayType.GetMethod("get_Item").Invoke(sensorsArray, new object[] { j });
                                            
                                            PropertyInfo sensorNameProperty = sensor.GetType().GetProperty("Name");
                                            PropertyInfo sensorTypeProperty = sensor.GetType().GetProperty("SensorType");
                                            PropertyInfo sensorValueProperty = sensor.GetType().GetProperty("Value");
                                            
                                            string sensorName = (string)sensorNameProperty.GetValue(sensor);
                                            string sensorType = sensorTypeProperty.GetValue(sensor).ToString();
                                            float? sensorValue = null;
                                            
                                            // Проверяем, имеет ли сенсор значение
                                            if (sensorValueProperty != null)
                                            {
                                                object valueObj = sensorValueProperty.GetValue(sensor);
                                                if (valueObj != null)
                                                {
                                                    sensorValue = Convert.ToSingle(valueObj);
                                                }
                                            }
                                            
                                            Console.WriteLine("[GPU_CS] Sensor: " + sensorName + ", Type: " + sensorType + 
                                                            ", Value: " + (sensorValue.HasValue ? sensorValue.ToString() : "null"));
                                            
                                            // Обрабатываем сенсоры в зависимости от их типа
                                            if (sensorValue.HasValue)
                                            {
                                                if (sensorType.Contains("Load") && (sensorName.Contains("GPU Core") || sensorName.Contains("GPU")))
                                                {
                                                    gpuData["Usage"] = Math.Round((double)sensorValue.Value, 2);
                                                    Console.WriteLine("[GPU_CS] Set GPU load: " + gpuData["Usage"] + "%");
                                                }
                                                else if (sensorType.Contains("Temperature") && (sensorName.Contains("GPU Core") || sensorName.Contains("GPU")))
                                                {
                                                    gpuData["Temperature"] = Math.Round((double)sensorValue.Value, 1);
                                                    Console.WriteLine("[GPU_CS] Set GPU temperature: " + gpuData["Temperature"] + "°C");
                                                }
                                                else if (sensorType.Contains("Clock") && (sensorName.Contains("GPU Core") || sensorName.Contains("GPU")))
                                                {
                                                    gpuData["Frequency"] = Math.Round((double)sensorValue.Value / 1000, 2);
                                                    Console.WriteLine("[GPU_CS] Set GPU frequency: " + gpuData["Frequency"] + " GHz");
                                                }
                                                else if (sensorType.Contains("SmallData") && sensorName.Contains("Memory Total"))
                                                {
                                                    gpuData["MemoryTotal"] = (long)(sensorValue.Value * 1024 * 1024);
                                                    Console.WriteLine("[GPU_CS] Set total video memory: " + sensorValue.Value + " MB");
                                                }
                                                else if (sensorType.Contains("SmallData") && sensorName.Contains("Memory Used"))
                                                {
                                                    gpuData["MemoryUsed"] = (long)(sensorValue.Value * 1024 * 1024);
                                                    Console.WriteLine("[GPU_CS] Set used video memory: " + sensorValue.Value + " MB");
                                                }
                                            }
                                        }
                                    }
                                    else
                                    {
                                        Console.WriteLine("[GPU_CS] WARNING: Sensors property not found");
                                    }
                                    
                                    // Получаем дополнительную информацию на основе названия GPU
                                    string gpuNameLower = hardwareName.ToLower();
                                    if (gpuNameLower.Contains("gtx 1060"))
                                    {
                                        // Определяем количество ядер CUDA
                                        if (gpuNameLower.Contains("6gb") || (gpuData["MemoryTotal"] is long && (long)gpuData["MemoryTotal"] > (long)(5 * 1024 * 1024 * 1024)))
                                        {
                                            gpuData["Cores"] = 1280; // GTX 1060 6GB
                                            Console.WriteLine("[GPU_CS] Determined CUDA cores for GTX 1060 6GB: 1280");
                                        }
                                        else
                                        {
                                            gpuData["Cores"] = 1152; // GTX 1060 3GB
                                            Console.WriteLine("[GPU_CS] Determined CUDA cores for GTX 1060 3GB: 1152");
                                        }
                                        
                                        // Определяем тип памяти
                                        gpuData["MemoryType"] = "GDDR5";
                                        Console.WriteLine("[GPU_CS] Set memory type: GDDR5");
                                    }
                                    
                                    // Берем только первую найденную видеокарту
                                    break;
                                }
                            }
                        }
                    }
                    else
                    {
                        Console.WriteLine("[GPU_CS] Hardware property returned null");
                    }
                }
                else
                {
                    Console.WriteLine("[GPU_CS] ERROR: Hardware property not found");
                }
                
                Console.WriteLine("[GPU_CS] Found " + gpuCount + " GPUs");
                
                // Закрываем компьютер
                MethodInfo closeMethod = computerType.GetMethod("Close");
                if (closeMethod != null)
                {
                    closeMethod.Invoke(computer, null);
                    Console.WriteLine("[GPU_CS] Computer.Close() method executed");
                }
                else
                {
                    Console.WriteLine("[GPU_CS] WARNING: Close method not found");
                }
                
                // Сериализуем данные в JSON
                string jsonOutput = JsonSerializer.Serialize(gpuData);
                Console.WriteLine("[GPU_CS] JSON data:");
                Console.WriteLine(jsonOutput);
                
            }
            catch (Exception ex)
            {
                Console.WriteLine("[GPU_CS] ERROR: " + ex.Message);
                if (ex.InnerException != null)
                {
                    Console.WriteLine("[GPU_CS] Inner Exception: " + ex.InnerException.Message);
                }
                Console.WriteLine("[GPU_CS] Stack Trace: " + ex.StackTrace);
                PrintDefaultData();
            }
        }
        
        private static void PrintDefaultData()
        {
            var defaultData = new Dictionary<string, object>
            {
                { "Name", "No data" },
                { "Usage", 0.0 },
                { "Temperature", null },
                { "MemoryTotal", 0L },
                { "MemoryUsed", 0L },
                { "Cores", null },
                { "Frequency", null },
                { "MemoryType", "No data" }
            };
            
            string jsonOutput = JsonSerializer.Serialize(defaultData);
            Console.WriteLine(jsonOutput);
        }
    }
    
    public static class FileInfoExtensions
    {
        public static void UnblockFile(this FileInfo file)
        {
            if (!file.Exists)
                return;
                
            var safeFileHandle = Microsoft.Win32.NativeMethods.CreateFile(
                file.FullName,
                Microsoft.Win32.NativeMethods.FILE_GENERIC_READ | Microsoft.Win32.NativeMethods.FILE_GENERIC_WRITE,
                0,
                IntPtr.Zero,
                Microsoft.Win32.NativeMethods.OPEN_EXISTING,
                Microsoft.Win32.NativeMethods.FILE_FLAG_BACKUP_SEMANTICS | Microsoft.Win32.NativeMethods.FILE_FLAG_OPEN_REPARSE_POINT,
                IntPtr.Zero);
                
            if (!safeFileHandle.IsInvalid)
            {
                try
                {
                    uint bytesReturned = 0;
                    Microsoft.Win32.NativeMethods.DeviceIoControl(
                        safeFileHandle,
                        Microsoft.Win32.NativeMethods.FSCTL_SET_REPARSE_POINT,
                        IntPtr.Zero,
                        0,
                        IntPtr.Zero,
                        0,
                        ref bytesReturned,
                        IntPtr.Zero);
                }
                finally
                {
                    safeFileHandle.Close();
                }
            }
        }
    }
    
    namespace Microsoft.Win32
    {
        internal static class NativeMethods
        {
            internal const uint FILE_GENERIC_READ = 0x80000000;
            internal const uint FILE_GENERIC_WRITE = 0x40000000;
            internal const uint OPEN_EXISTING = 3;
            internal const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
            internal const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
            internal const uint FSCTL_SET_REPARSE_POINT = 0x000900A4;
            
            [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Auto)]
            internal static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFile(
                string lpFileName,
                uint dwDesiredAccess,
                uint dwShareMode,
                IntPtr lpSecurityAttributes,
                uint dwCreationDisposition,
                uint dwFlagsAndAttributes,
                IntPtr hTemplateFile);
                
            [System.Runtime.InteropServices.DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Auto)]
            internal static extern bool DeviceIoControl(
                Microsoft.Win32.SafeHandles.SafeFileHandle hDevice,
                uint dwIoControlCode,
                IntPtr lpInBuffer,
                uint nInBufferSize,
                IntPtr lpOutBuffer,
                uint nOutBufferSize,
                ref uint lpBytesReturned,
                IntPtr lpOverlapped);
        }
    }
}
