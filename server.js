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
        console.log('Connected to SQLite database at:', DB_PATH);
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
                console.error('Error enabling foreign keys:', err);
            } else {
                console.log('Foreign key constraints enabled');
                // Verify foreign keys are enabled
                db.get('PRAGMA foreign_keys', (err, result) => {
                    if (err) {
                        console.error('Error checking foreign keys status:', err);
                    } else {
                        console.log('Foreign keys status:', result);
                    }
                });
        initializeDatabase();
            }
        });
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating students table:', err);
            } else {
                console.log('Students table created successfully');
            }
        });

        // Create payments table with CASCADE delete and status field
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            amount REAL NOT NULL,
            payment_date TEXT NOT NULL,
            payment_method TEXT,
            notes TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('paid', 'pending', 'overdue')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
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
app.use(express.static(path.join(__dirname, '..', 'spin-table-tennis')));

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

app.post('/api/students', async (req, res) => {
    try {
        const { name, email, phone, package, start_date, end_date, amount } = req.body;
        const result = await dbRun(
            'INSERT INTO students (name, email, phone, package, start_date, end_date, amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, package, start_date, end_date, amount]
        );
        const newStudent = await dbGet('SELECT * FROM students WHERE id = ?', [result.id]);
        res.status(201).json(newStudent);
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ error: 'Error creating student' });
    }
});

// Payments endpoints
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await dbAll(`
            SELECT 
                p.*,
                s.name as student_name,
                CASE 
                    WHEN p.status = 'paid' THEN 'paid'
                    WHEN date('now') > date(p.payment_date, '+30 days') THEN 'overdue'
                    ELSE 'pending'
                END as current_status
            FROM payments p
            LEFT JOIN students s ON p.student_id = s.id
            ORDER BY p.payment_date DESC
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

// Update student endpoint
app.put('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, package, start_date, end_date, amount } = req.body;
        
        // First, check if the student exists
        const student = await dbGet('SELECT * FROM students WHERE id = ?', [id]);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Update the student
        await dbRun(
            `UPDATE students 
             SET name = ?, email = ?, phone = ?, package = ?, 
                 start_date = ?, end_date = ?, amount = ?
             WHERE id = ?`,
            [name, email, phone, package, start_date, end_date, amount, id]
        );
        
        // Get the updated student
        const updatedStudent = await dbGet('SELECT * FROM students WHERE id = ?', [id]);
        res.json(updatedStudent);
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: 'Error updating student' });
    }
});

// Update payment status endpoint
app.put('/api/payments/status/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const { amount } = req.body;
        
        // Start a transaction
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION;');
                
                // Get all payments for this student
                db.all(
                    'SELECT * FROM payments WHERE student_id = ?',
                    [studentId],
                    async (err, payments) => {
                        if (err) {
                            db.run('ROLLBACK;');
                            return reject(err);
                        }
                        
                        try {
                            // Calculate total paid amount
                            const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
                            
                            // Get student's current amount
                            const student = await dbGet('SELECT amount FROM students WHERE id = ?', [studentId]);
                            if (!student) {
                                throw new Error('Student not found');
                            }
                            
                            // If no payments exist, create an initial payment record
                            if (payments.length === 0) {
                                await dbRun(
                                    `INSERT INTO payments (student_id, amount, payment_date, payment_method, notes, status)
                                     VALUES (?, ?, date('now'), 'System', 'Initial payment record', ?)`,
                                    [studentId, amount, amount === student.amount ? 'paid' : 'pending']
                                );
                            } else {
                                // Update existing payment records
                                for (const payment of payments) {
                                    await dbRun(
                                        `UPDATE payments 
                                         SET status = CASE 
                                             WHEN ? >= ? THEN 'paid'
                                             WHEN date('now') > date(payment_date, '+30 days') THEN 'overdue'
                                             ELSE 'pending'
                                         END
                                         WHERE id = ?`,
                                        [amount, student.amount, payment.id]
                                    );
                                }
                            }
                            
                            db.run('COMMIT;');
                            resolve();
                        } catch (error) {
                            db.run('ROLLBACK;');
                            reject(error);
                        }
                    }
                );
            });
        });
        
        // Get updated payments
        const updatedPayments = await dbAll(
            'SELECT * FROM payments WHERE student_id = ?',
            [studentId]
        );
        
        res.json({
            success: true,
            message: 'Payment status updated successfully',
            payments: updatedPayments
        });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Error updating payment status' });
    }
});

// Delete student endpoint
app.delete('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Received delete request for student ID: ${id}`);
        
        // First, check if the student exists
        const student = await dbGet('SELECT * FROM students WHERE id = ?', [id]);
        console.log('Found student:', student);
        
        if (!student) {
            console.log(`No student found with ID: ${id}`);
            return res.status(404).json({ error: 'Student not found' });
        }

        // Get associated payments before deletion
        const payments = await dbAll('SELECT * FROM payments WHERE student_id = ?', [id]);
        console.log(`Found ${payments.length} payments associated with student:`, payments);
        
        // Start a transaction to ensure atomicity
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION;');
                
                // Delete the student (payments will be deleted automatically due to ON DELETE CASCADE)
                db.run('DELETE FROM students WHERE id = ?', [id], function(err) {
                    if (err) {
                        console.error('Error during delete:', err);
                        db.run('ROLLBACK;');
                        return reject(err);
                    }
                    
                    // Check if any rows were affected
                    if (this.changes === 0) {
                        console.log('No rows affected during delete');
                            db.run('ROLLBACK;');
                            return reject(new Error('No student found with the specified ID'));
                    }
                    
                    // Verify payments were deleted
                    db.all('SELECT * FROM payments WHERE student_id = ?', [id], (err, remainingPayments) => {
                        if (err) {
                            console.error('Error checking remaining payments:', err);
                        } else {
                            console.log('Remaining payments after delete:', remainingPayments);
                            if (remainingPayments.length > 0) {
                                console.warn('Warning: Some payments were not deleted');
                            } else {
                                console.log('All associated payments were successfully deleted');
                            }
                        }
                    });
                    
                    console.log(`Successfully deleted student with ID: ${id}`);
                    db.run('COMMIT;');
                    resolve();
                });
            });
        });
        
        res.status(200).json({ 
            success: true, 
            message: 'Student and all associated payments deleted successfully',
            deletedPayments: payments.length
        });
    } catch (error) {
        console.error('Error in delete endpoint:', error);
        if (error.message === 'No student found with the specified ID') {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Error deleting student: ' + error.message });
        }
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
