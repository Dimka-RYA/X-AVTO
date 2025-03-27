use tauri::{command, Window};

#[command]
pub fn close_window(window: Window) {
    window.close().unwrap();
}

#[command]
pub fn minimize_window(window: Window) {
    window.minimize().unwrap();
}

#[command]
pub fn toggle_maximize(window: Window) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}
