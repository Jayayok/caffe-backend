// server.js - Backend untuk Bintang Terang Caffe POS
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pos_bintang_terang',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ==================== AUTH ENDPOINTS ====================

// Register (untuk setup awal)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await pool.execute(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username, hashedPassword, role || 'admin']
        );

        res.status(201).json({ message: 'User created', userId: result.insertId });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== MENU ENDPOINTS ====================

// Get all menu items
app.get('/api/menu', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM menu_items ORDER BY name'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// Get single menu item
app.get('/api/menu/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM menu_items WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching menu item:', error);
        res.status(500).json({ error: 'Failed to fetch menu item' });
    }
});

// Create menu item
app.post('/api/menu', authenticateToken, async (req, res) => {
    try {
        const { name, price, stock, minStock, category, description, image } = req.body;

        const [result] = await pool.execute(
            `INSERT INTO menu_items (name, price, stock, min_stock, category, description, image) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, price, stock, minStock || 5, category, description || '', image || '']
        );

        res.status(201).json({ 
            message: 'Menu item created', 
            id: result.insertId 
        });
    } catch (error) {
        console.error('Error creating menu item:', error);
        res.status(500).json({ error: 'Failed to create menu item' });
    }
});

// Update menu item
app.put('/api/menu/:id', authenticateToken, async (req, res) => {
    try {
        const { name, price, stock, minStock, category, description, image } = req.body;

        const [result] = await pool.execute(
            `UPDATE menu_items 
             SET name = ?, price = ?, stock = ?, min_stock = ?, 
                 category = ?, description = ?, image = ?, last_updated = NOW()
             WHERE id = ?`,
            [name, price, stock, minStock, category, description, image, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        res.json({ message: 'Menu item updated' });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});

// Delete menu item
app.delete('/api/menu/:id', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.execute(
            'DELETE FROM menu_items WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        res.json({ message: 'Menu item deleted' });
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ error: 'Failed to delete menu item' });
    }
});

// ==================== TRANSACTION ENDPOINTS ====================

// Create transaction
app.post('/api/transactions', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const { items, total, method, dineType, location } = req.body;

        // Insert transaction
        const [transResult] = await connection.execute(
            `INSERT INTO transactions (total, payment_method, dine_type, location) 
             VALUES (?, ?, ?, ?)`,
            [total, method, dineType, location || 'N/A']
        );

        const transactionId = transResult.insertId;

        // Insert transaction items and update stock
        for (const item of items) {
            await connection.execute(
                `INSERT INTO transaction_items (transaction_id, menu_item_id, menu_name, price, quantity) 
                 VALUES (?, ?, ?, ?, ?)`,
                [transactionId, item.id || 0, item.name, item.price, 1]
            );

            // Update stock
            await connection.execute(
                'UPDATE menu_items SET stock = stock - 1 WHERE name = ?',
                [item.name]
            );
        }

        await connection.commit();

        res.status(201).json({ 
            message: 'Transaction created', 
            transactionId 
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    } finally {
        connection.release();
    }
});

// Get all transactions
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let query = `
            SELECT t.*, 
                   GROUP_CONCAT(CONCAT(ti.menu_name, ' (', ti.quantity, 'x)') SEPARATOR ', ') as items_summary
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
        `;
        
        const params = [];
        
        if (startDate && endDate) {
            query += ' WHERE DATE(t.created_at) BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        
        query += ' GROUP BY t.id ORDER BY t.created_at DESC';

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get transaction detail
app.get('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const [transactions] = await pool.execute(
            'SELECT * FROM transactions WHERE id = ?',
            [req.params.id]
        );

        if (transactions.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const [items] = await pool.execute(
            'SELECT * FROM transaction_items WHERE transaction_id = ?',
            [req.params.id]
        );

        res.json({
            ...transactions[0],
            items
        });
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ error: 'Failed to fetch transaction' });
    }
});

// ==================== REPORTS ENDPOINTS ====================

// Get omset summary
app.get('/api/reports/omset', authenticateToken, async (req, res) => {
    try {
        const [daily] = await pool.execute(
            'SELECT COALESCE(SUM(total), 0) as total FROM transactions WHERE DATE(created_at) = CURDATE()'
        );

        const [monthly] = await pool.execute(
            'SELECT COALESCE(SUM(total), 0) as total FROM transactions WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())'
        );

        const [yearly] = await pool.execute(
            'SELECT COALESCE(SUM(total), 0) as total FROM transactions WHERE YEAR(created_at) = YEAR(CURDATE())'
        );

        res.json({
            daily: daily[0].total,
            monthly: monthly[0].total,
            yearly: yearly[0].total
        });
    } catch (error) {
        console.error('Error fetching omset:', error);
        res.status(500).json({ error: 'Failed to fetch omset' });
    }
});

// Get sales chart data (last 7 days)
app.get('/api/reports/sales-chart', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT DATE(created_at) as date, SUM(total) as total
            FROM transactions
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error fetching sales chart:', error);
        res.status(500).json({ error: 'Failed to fetch sales chart' });
    }
});

// Get top selling products
app.get('/api/reports/top-products', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT ti.menu_name, SUM(ti.quantity) as total_sold
            FROM transaction_items ti
            JOIN transactions t ON ti.transaction_id = t.id
            WHERE YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())
            GROUP BY ti.menu_name
            ORDER BY total_sold DESC
            LIMIT 5
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error fetching top products:', error);
        res.status(500).json({ error: 'Failed to fetch top products' });
    }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
    try {
        await pool.execute('SELECT 1');
        res.json({ status: 'ok', message: 'Database connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api`);
});

module.exports = app;