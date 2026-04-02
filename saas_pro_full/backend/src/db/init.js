const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'saas_user',
  password: process.env.DB_PASS || 'saas_password',
  database: process.env.DB_NAME || 'saas_db',
  port: 5432,
});

(async () => {
    try {
        console.log('--- STARTING DB RESET ---');

        // 1. Drop existing tables to ensure clean state
        console.log('Dropping tables...');
        await pool.query('DROP TABLE IF EXISTS events CASCADE');
        await pool.query('DROP TABLE IF EXISTS documents CASCADE');
        await pool.query('DROP TABLE IF EXISTS parents CASCADE');
        await pool.query('DROP TABLE IF EXISTS schedules CASCADE');
        await pool.query('DROP TABLE IF EXISTS enrollments CASCADE');
        await pool.query('DROP TABLE IF EXISTS academic_periods CASCADE');
        await pool.query('DROP TABLE IF EXISTS schools CASCADE');
        await pool.query('DROP TABLE IF EXISTS newsletter_subscribers CASCADE');
        await pool.query('DROP TABLE IF EXISTS contact_submissions CASCADE');
        await pool.query('DROP TABLE IF EXISTS teachers CASCADE');
        await pool.query('DROP TABLE IF EXISTS payments CASCADE');
        await pool.query('DROP TABLE IF EXISTS attendance CASCADE');
        await pool.query('DROP TABLE IF EXISTS grades CASCADE');
        await pool.query('DROP TABLE IF EXISTS student_courses CASCADE');
        await pool.query('DROP TABLE IF EXISTS courses CASCADE');
        await pool.query('DROP TABLE IF EXISTS students CASCADE');
        await pool.query('DROP TABLE IF EXISTS activity_logs CASCADE');
        await pool.query('DROP TABLE IF EXISTS announcements CASCADE');
        await pool.query('DROP TABLE IF EXISTS school_settings CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');
        console.log('Tables dropped.');

        // 2. Define schema directly in JS to avoid file reading issues
        console.log('Creating schema...');
        const schema = `
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'teacher', 'parent')),
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            );

            CREATE TABLE students (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                grade VARCHAR(50) NOT NULL,
                parent_email VARCHAR(255) NOT NULL,
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE courses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                teacher_id INT REFERENCES users(id),
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE student_courses (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                course_id INT REFERENCES courses(id),
                UNIQUE(student_id, course_id)
            );

            CREATE TABLE grades (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                course_id INT REFERENCES courses(id),
                subject VARCHAR(255) NOT NULL,
                score DECIMAL(5,2) NOT NULL,
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE attendance (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                course_id INT REFERENCES courses(id),
                date DATE NOT NULL,
                status VARCHAR(20) NOT NULL,
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE payments (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                amount DECIMAL(10,2) NOT NULL,
                date DATE NOT NULL,
                status VARCHAR(20) NOT NULL,
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE activity_logs (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                action VARCHAR(255) NOT NULL,
                entity_type VARCHAR(50),
                entity_id INT,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE announcements (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                category VARCHAR(50) DEFAULT 'general',
                priority VARCHAR(20) DEFAULT 'medium',
                target_audience VARCHAR(50) DEFAULT 'all',
                is_pinned BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                expires_at TIMESTAMP,
                created_by INT REFERENCES users(id),
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE school_settings (
                id SERIAL PRIMARY KEY,
                school_id INT UNIQUE NOT NULL,
                grade_scale VARCHAR(20) DEFAULT '0-7' CHECK (grade_scale IN ('0-7', '0-100', 'A-F')),
                currency VARCHAR(10) DEFAULT 'USD',
                academic_year VARCHAR(20) DEFAULT '2024',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE teachers (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                subject VARCHAR(255),
                phone VARCHAR(50),
                qualification VARCHAR(255),
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                bio TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE contact_submissions (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'replied')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE newsletter_subscribers (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                subscribed BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- NUEVAS TABLAS PARA LAS 7 ENTIDADES
            CREATE TABLE academic_periods (
                id SERIAL PRIMARY KEY,
                school_id INT NOT NULL,
                name VARCHAR(50) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                year INT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE schools (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50) UNIQUE,
                address TEXT,
                phone VARCHAR(50),
                email VARCHAR(255),
                website VARCHAR(255),
                logo_url TEXT,
                director_name VARCHAR(255),
                director_phone VARCHAR(50),
                director_email VARCHAR(255),
                foundation_date DATE,
                school_type VARCHAR(50),
                education_level VARCHAR(50),
                student_count INT DEFAULT 0,
                teacher_count INT DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE parents (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                relationship VARCHAR(50),
                phone VARCHAR(50),
                email VARCHAR(255),
                address TEXT,
                occupation VARCHAR(255),
                student_id INT REFERENCES students(id),
                school_id INT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE enrollments (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                school_id INT REFERENCES schools(id),
                academic_year INT NOT NULL,
                grade VARCHAR(50) NOT NULL,
                section VARCHAR(10),
                enrollment_date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                tuition_fee DECIMAL(10,2),
                payment_status VARCHAR(20) DEFAULT 'pending',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE schedules (
                id SERIAL PRIMARY KEY,
                course_id INT REFERENCES courses(id),
                teacher_id INT REFERENCES teachers(id),
                school_id INT NOT NULL,
                day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                classroom VARCHAR(50),
                academic_year INT NOT NULL,
                semester INT DEFAULT 1,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE documents (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                document_type VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                file_url TEXT,
                description TEXT,
                is_verified BOOLEAN DEFAULT false,
                verified_by INT REFERENCES users(id),
                verified_at TIMESTAMP,
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE events (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                event_type VARCHAR(50) DEFAULT 'academic',
                start_date TIMESTAMP NOT NULL,
                end_date TIMESTAMP,
                location VARCHAR(255),
                is_holiday BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                target_audience VARCHAR(50) DEFAULT 'all',
                organizer_id INT REFERENCES users(id),
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(schema);
        console.log('Schema created successfully.');

        // 3. Create default admin
        console.log('Creating default admin...');
        const hashedPassword = await bcrypt.hash('123', 10);
        await pool.query(
            "INSERT INTO users (name, email, password, role, school_id) VALUES ($1, $2, $3, $4, $5)",
            ['Director', 'director@school.com', hashedPassword, 'admin', 1]
        );
        console.log('SUCCESS: Default admin user created: director@school.com / 123');

        // 4. Create default school settings
        console.log('Creating default school settings...');
        await pool.query(
            "INSERT INTO school_settings (school_id, grade_scale, currency, academic_year) VALUES ($1, $2, $3, $4)",
            [1, '0-7', 'USD', '2024']
        );
        console.log('SUCCESS: Default school settings created');

    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
    setTimeout(() => {
        pool.end();
    }, 1000);
})();
