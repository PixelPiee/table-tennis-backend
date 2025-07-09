# Spin Table Tennis Academy Backend

A backend API for managing table tennis academy students and payments.

## Features
- Student management
- Payment tracking
- SQLite database
- RESTful API

## Local Development
```bash
npm install
npm start
```

Server runs on http://localhost:3001

## API Endpoints
- `GET /api/students` - Get all students
- `POST /api/students` - Add new student
- `GET /api/payments` - Get all payments
- `POST /api/payments` - Add new payment

## Database Schema
- **Students**: id, name, email, phone, package, start_date, end_date, amount, created_at
- **Payments**: id, student_id, amount, payment_date, payment_method, notes, created_at

## Deployment
This app is ready for deployment on Railway, Render, or similar platforms.
