-- Database Schema untuk Bintang Terang Caffe POS
-- Jalankan script ini untuk membuat database dan tabel

CREATE DATABASE IF NOT EXISTS pos_bintang_terang;
USE pos_bintang_terang;

-- Tabel Users (untuk autentikasi)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'kasir') DEFAULT 'kasir',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    min_stock INT NOT NULL DEFAULT 5,
    category ENUM('minuman', 'makanan') NOT NULL,
    description TEXT,
    image TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    total DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash', 'qris') NOT NULL,
    dine_type ENUM('takeaway', 'dinein') NOT NULL,
    location VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Transaction Items (detail transaksi)
CREATE TABLE IF NOT EXISTS transaction_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    menu_item_id INT,
    menu_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password, role) VALUES 
('admin', '$2a$10$X8xhJ5J5J5J5J5J5J5J5J.5J5J5J5J5J5J5J5J5J5J5J5J5J5J5Je', 'admin');

-- Insert sample menu items
INSERT INTO menu_items (name, price, stock, min_stock, category, description, image) VALUES
('Espresso', 15000, 20, 5, 'minuman', 'Kopi espresso murni dengan cita rasa bold dan aroma khas yang kuat. Sempurna untuk penikmat kopi sejati.', 'https://via.placeholder.com/250x150?text=Espresso'),
('Latte', 20000, 15, 8, 'minuman', 'Perpaduan sempurna espresso dengan susu steamed yang creamy. Menghasilkan rasa yang lembut dan nikmat.', 'https://via.placeholder.com/250x150?text=Latte'),
('Croissant', 10000, 10, 5, 'makanan', 'Pastry Prancis yang renyah di luar, lembut di dalam. Cocok untuk sarapan atau teman minum kopi.', 'https://via.placeholder.com/250x150?text=Croissant'),
('Cappuccino', 18000, 12, 6, 'minuman', 'Kombinasi espresso, susu steamed, dan foam yang sempurna. Memberikan sensasi kopi yang creamy dan lembut.', 'https://via.placeholder.com/250x150?text=Cappuccino'),
('Brown Sugar Coffee', 22000, 8, 10, 'minuman', 'Kopi dengan gula aren yang memberikan rasa manis alami dan aroma karamel yang menggoda.', 'https://via.placeholder.com/250x150?text=Brown+Sugar+Coffee');

-- Create indexes for better performance
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_transaction_items_trans_id ON transaction_items(transaction_id);