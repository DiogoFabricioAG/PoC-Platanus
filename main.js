const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;
let alertWindow = null;
let monitoringInterval = null;

// Importar screenshot desde Python
const { spawn } = require('child_process');

function createMainWindow() {
  // Ventana principal (headless - oculta)
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Headless - no se muestra
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Iniciar monitoreo después de 5 segundos
  setTimeout(() => {
    startMonitoring();
  }, 5000);
}

function captureScreenExcludingElectron(callback) {
  // Ocultar ventana de alerta antes de capturar
  const wasVisible = alertWindow && !alertWindow.isDestroyed() && alertWindow.isVisible();
  
  if (wasVisible) {
    alertWindow.hide();
  }
  
  // Esperar un momento para que la ventana se oculte completamente
  setTimeout(() => {
    // Capturar pantalla usando pyautogui
    const pythonScript = `
import pyautogui
from datetime import datetime
import os
import base64

# Crear carpeta si no existe
if not os.path.exists('screenshots'):
    os.makedirs('screenshots')

# Capturar pantalla
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
filename = f"screenshots/screenshot_{timestamp}.png"
screenshot = pyautogui.screenshot()
screenshot.save(filename)

# Convertir a base64
with open(filename, "rb") as image_file:
    encoded = base64.b64encode(image_file.read()).decode('utf-8')
    print(encoded)
`;

    const python = spawn('python', ['-c', pythonScript]);
    
    let dataString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      console.error(`Error: ${data}`);
    });
    
    python.on('close', (code) => {
      // Mostrar ventana nuevamente
      if (wasVisible && alertWindow && !alertWindow.isDestroyed()) {
        alertWindow.show();
      }
      
      if (code === 0 && dataString.trim()) {
        callback(null, dataString.trim());
      } else {
        callback(new Error('Failed to capture screenshot'), null);
      }
    });
  }, 200); // Esperar 200ms para que la ventana se oculte
}

function startMonitoring() {
  // Captura inicial
  captureAndAnalyze();
  
  // Capturar cada 10 segundos
  monitoringInterval = setInterval(() => {
    captureAndAnalyze();
  }, 10000);
}

function captureAndAnalyze() {
  console.log('Capturando pantalla...');
  
  captureScreenExcludingElectron((error, base64Image) => {
    if (error) {
      console.error('Error capturando:', error);
      return;
    }
    
    // Simular análisis con porcentaje variable
    const detectionData = {
      percentage: Math.floor(Math.random() * 30) + 70, // 70-100%
      level: 'PELIGRO',
      timestamp: new Date().toLocaleString('es-ES'),
      findings: [
        'URL sospechosa detectada',
        'Solicitud de credenciales bancarias',
        'Dominio no verificado'
      ],
      screenshotBase64: base64Image
    };
    
    // Mostrar o actualizar alerta
    if (!alertWindow || alertWindow.isDestroyed()) {
      showPhishingAlert(detectionData);
    } else {
      // Actualizar ventana existente
      alertWindow.webContents.send('update-detection', detectionData);
    }
  });
}

function showPhishingAlert(initialData) {
  // Obtener dimensiones de pantalla
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  
  // Crear ventana de alerta en la esquina superior derecha
  alertWindow = new BrowserWindow({
    width: 600,
    height: 700,
    x: width - 620,
    y: 20,
    frame: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  alertWindow.loadFile('alert.html');

  // Enviar datos iniciales
  alertWindow.webContents.on('did-finish-load', () => {
    alertWindow.webContents.send('phishing-detected', initialData);
  });

  alertWindow.on('closed', () => {
    alertWindow = null;
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC para cerrar la alerta
ipcMain.on('close-alert', () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  if (alertWindow) {
    alertWindow.close();
  }
  app.quit();
});
