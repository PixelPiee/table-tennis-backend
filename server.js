const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'database.sqlite');

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Create students table
        db.run(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            package TEXT,
            start_date TEXT,
            end_date TEXT,
            amount REAL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating students table:', err);
            } else {
                console.log('Students table created successfully');
            }
        });

        // Create payments table
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            amount REAL NOT NULL,
            payment_date TEXT NOT NULL,
            payment_method TEXT,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students (id)
        )`, (err) => {
            if (err) {
                console.error('Error creating payments table:', err);
            } else {
                console.log('Payments table created successfully');
                console.log('Database initialization complete');
            }
        });
    });
}

app.use(cors());
app.use(bodyParser.json());

// Helper function to run database queries with promises
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Students endpoints
app.get('/api/students', async (req, res) => {
    try {
        const students = await dbAll('SELECT * FROM students');
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Error fetching students' });
    }
});

// Add student endpoint
app.post('/api/students', async (req, res) => {
    try {
        const { name, email, phone, package, start_date, end_date, amount, status } = req.body;
        console.log('Adding student with data:', req.body); // Debug log

        const result = await dbRun(
            'INSERT INTO students (name, email, phone, package, start_date, end_date, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, package, start_date, end_date, amount, status]
        );

        const newStudent = await dbGet('SELECT * FROM students WHERE id = ?', [result.id]);
        console.log('Added student:', newStudent); // Debug log
        res.status(201).json(newStudent);
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ error: 'Error creating student' });
    }
});

// Update student endpoint
app.put('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, package, start_date, end_date, amount, status } = req.body;
        console.log('Updating student with data:', req.body); // Debug log
        
        // First, check if the student exists
        const student = await dbGet('SELECT * FROM students WHERE id = ?', [id]);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Update the student
        await dbRun(
            `UPDATE students 
             SET name = ?, email = ?, phone = ?, package = ?, 
                 start_date = ?, end_date = ?, amount = ?, status = ?
             WHERE id = ?`,
            [name, email, phone, package, start_date, end_date, amount, status, id]
        );
        
        // Get the updated student
        const updatedStudent = await dbGet('SELECT * FROM students WHERE id = ?', [id]);
        console.log('Updated student:', updatedStudent); // Debug log
        res.json(updatedStudent);
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: 'Error updating student' });
    }
});

// Payments endpoints
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await dbAll(`
            SELECT p.*, s.name as student_name 
            FROM payments p
            LEFT JOIN students s ON p.student_id = s.id
        `);
        res.json(payments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Error fetching payments' });
    }
});

app.post('/api/payments', async (req, res) => {
    try {
        const { student_id, amount, payment_date, payment_method, notes } = req.body;
        const result = await dbRun(
            'INSERT INTO payments (student_id, amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?)',
            [student_id, amount, payment_date, payment_method, notes]
        );
        const newPayment = await dbGet('SELECT * FROM payments WHERE id = ?', [result.id]);
        res.status(201).json(newPayment);
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: 'Error creating payment' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Handle process termination
db.on('open', () => {
    console.log('Database connection is open');
});

db.on('error', (err) => {
    console.error('Database error:', err);
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    db.close(() => {
        console.log('Database connection closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    db.close(() => {
        console.log('Database connection closed');
        process.exit(0);
    });
});

// Keep the process alive
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});
