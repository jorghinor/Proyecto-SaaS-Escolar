const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'saas_user',
  password: process.env.DB_PASS || 'saas_password',
  database: process.env.DB_NAME || 'saas_db',
  port: 5432,
});

(async () => {
    try {
        console.log('--- MIGRACIÓN: Agregando tablas de libretas ---');

        // Crear tablas solo si no existen (sin borrar nada)
        const migrations = [
            {
                name: 'report_cards',
                sql: `
                    CREATE TABLE IF NOT EXISTS report_cards (
                        id SERIAL PRIMARY KEY,
                        student_id INT REFERENCES students(id),
                        period_id INT,
                        year INT NOT NULL,
                        behavior_grade DECIMAL(3,1),
                        comments TEXT,
                        average_score DECIMAL(3,1),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'report_card_details',
                sql: `
                    CREATE TABLE IF NOT EXISTS report_card_details (
                        id SERIAL PRIMARY KEY,
                        report_card_id INT REFERENCES report_cards(id) ON DELETE CASCADE,
                        course_id INT REFERENCES courses(id),
                        subject_name VARCHAR(255),
                        score DECIMAL(3,1) NOT NULL,
                        behavior_grade DECIMAL(3,1),
                        teacher_id INT,
                        comments TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `
            }
        ];

        for (const migration of migrations) {
            try {
                await pool.query(migration.sql);
                console.log(`✓ Tabla '${migration.name}' creada o ya existe`);
            } catch (err) {
                console.error(`✗ Error creando '${migration.name}':`, err.message);
            }
        }

        console.log('--- MIGRACIÓN COMPLETADA ---');
        console.log('Las tablas de libretas están listas para usar.');
        
    } catch (err) {
        console.error('Error en migración:', err);
    } finally {
        await pool.end();
    }
})();
