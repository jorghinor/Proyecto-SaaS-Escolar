const db = require('../db');
const bcrypt = require('bcrypt');

async function runMigrations() {
    const client = await db.connect();
    try {
        console.log('Running database migrations...');
        await client.query('BEGIN');

        // 1. Core Migrations (existing tables and standard updates)
        const migrations = `
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                teacher_id INT REFERENCES users(id),
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS student_courses (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                course_id INT REFERENCES courses(id),
                UNIQUE(student_id, course_id)
            );

            -- Ensure users has last_login and created_at
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_at') THEN
                    ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
                    ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
                END IF;
            END $$;

            -- 2. Link Parents to Users
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parents' AND column_name = 'user_id') THEN
                    ALTER TABLE parents ADD COLUMN user_id INT REFERENCES users(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `;
        await client.query(migrations);

        // 3. Fix existing parents (Gabriel, Lidia, etc.)
        // Get parents that don't have a user_id yet
        const { rows: orphanedParents } = await client.query('SELECT * FROM parents WHERE user_id IS NULL');
        
        if (orphanedParents.length > 0) {
            console.log(`Found ${orphanedParents.length} parents to synchronize...`);
            
            for (const parent of orphanedParents) {
                // Check if user already exists by email
                const { rows: existingUsers } = await client.query('SELECT id FROM users WHERE email = $1', [parent.email]);
                
                let userId;
                if (existingUsers.length > 0) {
                    userId = existingUsers[0].id;
                    console.log(`Linking existing user for ${parent.email}`);
                } else {
                    // Create new user for parent
                    const salt = await bcrypt.genSalt(10);
                    // Use phone as default password if available, otherwise 'Parent123!'
                    const defaultPassword = parent.phone || 'Parent123!';
                    const hashPassword = await bcrypt.hash(defaultPassword, salt);
                    
                    const userResult = await client.query(
                        'INSERT INTO users (name, email, password, role, school_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                        [`${parent.first_name} ${parent.last_name}`, parent.email, hashPassword, 'parent', parent.school_id]
                    );
                    userId = userResult.rows[0].id;
                    console.log(`Created new user account for ${parent.email} (Password: ${defaultPassword})`);
                }
                
                // Link parent to user
                await client.query('UPDATE parents SET user_id = $1 WHERE id = $2', [userId, parent.id]);
            }
        }

        await client.query('COMMIT');
        console.log('Migrations completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration error:', err);
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
