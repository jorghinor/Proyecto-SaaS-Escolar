const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const db = require('./db');
const { runMigrations } = require('./db/migrate');
const bcrypt = require('bcrypt');
const { auth } = require('./middleware/auth.middleware');
const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const gradeRoutes = require('./routes/grade.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const paymentRoutes = require('./routes/payment.routes');
const reportRoutes = require('./routes/report.routes');
const courseRoutes = require('./routes/course.routes');
const settingsRoutes = require('./routes/settings.routes');
const teacherRoutes = require('./routes/teacher.routes');
const publicRoutes = require('./routes/public.routes');
const reportCardRoutes = require('./routes/reportcard.routes');
const academicPeriodRoutes = require('./routes/academicperiod.routes');
const schoolRoutes = require('./routes/school.routes');
const enrollmentRoutes = require('./routes/enrollment.routes');
const scheduleRoutes = require('./routes/schedule.routes');
const announcementRoutes = require('./routes/announcement.routes');
const parentRoutes = require('./routes/parent.routes');
const documentRoutes = require('./routes/document.routes');
const eventRoutes = require('./routes/event.routes');
const templateRoutes = require('./routes/templates.routes');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRoutes);
app.use('/students', studentRoutes);
app.use('/grades', gradeRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/payments', paymentRoutes);
app.use('/reports', reportRoutes);
app.use('/courses', courseRoutes);
app.use('/settings', settingsRoutes);
app.use('/teachers', teacherRoutes);
app.use('/public', publicRoutes);
app.use('/report-cards', reportCardRoutes);
app.use('/academic-periods', academicPeriodRoutes);
app.use('/schools', schoolRoutes);
app.use('/enrollments', enrollmentRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/announcements', announcementRoutes);
app.use('/parents', parentRoutes);
app.use('/documents', documentRoutes);
app.use('/events', eventRoutes);
app.use('/templates', templateRoutes);

// Migration endpoint to create missing tables
app.get('/migrate', async (req, res) => {
    try {
        await runMigrations();
        res.json({ success: true, message: 'Migration completed successfully' });
    } catch (err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint específico para migrar tablas de libretas
app.get('/migrate-reportcards', async (req, res) => {
    try {
        console.log('Creando tablas de libretas...');
        
        // Crear tabla de períodos académicos PRIMERO
        await db.query(`
            CREATE TABLE IF NOT EXISTS academic_periods (
                id SERIAL PRIMARY KEY,
                school_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                year INT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Tabla academic_periods creada');
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS report_cards (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                period_id INT REFERENCES academic_periods(id),
                year INT NOT NULL,
                behavior_grade DECIMAL(3,1),
                comments TEXT,
                average_score DECIMAL(3,1),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await db.query(`
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
        `);
        
        // Insertar períodos académicos por defecto si no existen
        const { rows } = await db.query('SELECT COUNT(*) FROM academic_periods');
        if (parseInt(rows[0].count) === 0) {
            await db.query(`
                INSERT INTO academic_periods (school_id, name, start_date, end_date, year, is_active)
                VALUES 
                    (1, 'Primer Trimestre', '2024-01-15', '2024-04-15', 2024, true),
                    (1, 'Segundo Trimestre', '2024-04-16', '2024-07-15', 2024, true),
                    (1, 'Tercer Trimestre', '2024-07-16', '2024-11-15', 2024, true),
                    (1, 'Primer Trimestre', '2025-01-15', '2025-04-15', 2025, true),
                    (1, 'Segundo Trimestre', '2025-04-16', '2025-07-15', 2025, true),
                    (1, 'Tercer Trimestre', '2025-07-16', '2025-11-15', 2025, true)
            `);
            console.log('Períodos académicos insertados');
        }
        
        // Crear tabla de plantillas de materias
        await db.query(`
            CREATE TABLE IF NOT EXISTS subject_templates (
                id SERIAL PRIMARY KEY,
                school_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                default_score DECIMAL(3,1),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            )
        `);
        
        console.log('Tabla de plantillas creada exitosamente');
        
        // ===== NUEVAS TABLAS RELACIONALES (ARQUITECTURA CORRECTA) =====
        
        // 1. Tabla subjects (plan de estudios base)
        await db.query(`
            CREATE TABLE IF NOT EXISTS subjects (
                id SERIAL PRIMARY KEY,
                school_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50),
                min_score DECIMAL(3,1) DEFAULT 4.0,
                max_score DECIMAL(3,1) DEFAULT 7.0,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            )
        `);
        console.log('✅ Tabla subjects creada');
        
        // 2. Tabla enrollments (matrículas formales)
        await db.query(`
            CREATE TABLE IF NOT EXISTS enrollments (
                id SERIAL PRIMARY KEY,
                student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                school_id INT NOT NULL,
                grade_level VARCHAR(100) NOT NULL,
                period_id INT REFERENCES academic_periods(id),
                status VARCHAR(20) DEFAULT 'active',
                enrollment_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, period_id)
            )
        `);
        console.log('✅ Tabla enrollments creada');
        
        // 3. Tabla teacher_assignments
        await db.query(`
            CREATE TABLE IF NOT EXISTS teacher_assignments (
                id SERIAL PRIMARY KEY,
                teacher_id INT NOT NULL,
                course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                period_id INT REFERENCES academic_periods(id),
                school_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(course_id, period_id)
            )
        `);
        console.log('✅ Tabla teacher_assignments creada');
        
        // 4. Agregar columnas relacionales a courses
        await db.query(`
            ALTER TABLE courses 
            ADD COLUMN IF NOT EXISTS subject_id INT REFERENCES subjects(id),
            ADD COLUMN IF NOT EXISTS grade_level VARCHAR(100),
            ADD COLUMN IF NOT EXISTS section VARCHAR(50)
        `);
        console.log('✅ Columnas relacionales agregadas a courses');
        
        console.log('Tablas de libretas creadas exitosamente');
        res.json({ success: true, message: 'Tablas de libretas, períodos académicos, plantillas y estructura relacional creados exitosamente' });
    } catch (err) {
        console.error('Error creando tablas de libretas:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const PORT = process.env.PORT || 3000;

// Inicializar base de datos al arrancar
async function initializeDatabase() {
    try {
        console.log('Inicializando base de datos...');
        
        // Ejecutar migraciones estructurales y sincronización de padres
        await runMigrations();
        
        // Insertar períodos para todos los colegios existentes
        const { rows: schools } = await db.query('SELECT id FROM schools');
        
        for (const school of schools) {
            const schoolId = school.id;
            
            // Verificar si ya tiene períodos
            const { rows: existing } = await db.query(
                'SELECT COUNT(*) FROM academic_periods WHERE school_id = $1',
                [schoolId]
            );
            
            if (parseInt(existing[0].count) === 0) {
                const currentYear = new Date().getFullYear();
                const prevYear = currentYear - 1;
                
                await db.query(`
                    INSERT INTO academic_periods (school_id, name, start_date, end_date, year, is_active)
                    VALUES 
                        ($1, 'Primer Trimestre', '${prevYear}-01-15', '${prevYear}-04-15', ${prevYear}, true),
                        ($1, 'Segundo Trimestre', '${prevYear}-04-16', '${prevYear}-07-15', ${prevYear}, true),
                        ($1, 'Tercer Trimestre', '${prevYear}-07-16', '${prevYear}-11-15', ${prevYear}, true),
                        ($1, 'Primer Trimestre', '${currentYear}-01-15', '${currentYear}-04-15', ${currentYear}, true),
                        ($1, 'Segundo Trimestre', '${currentYear}-04-16', '${currentYear}-07-15', ${currentYear}, true),
                        ($1, 'Tercer Trimestre', '${currentYear}-07-16', '${currentYear}-11-15', ${currentYear}, true)
                `, [schoolId]);
                
                console.log(`✅ Períodos creados para colegio ID ${schoolId}`);
            }
        }
        
        console.log('✅ Base de datos inicializada correctamente');
    } catch (err) {
        console.error('❌ Error inicializando base de datos:', err);
    }
}

// Endpoint para auto-configurar estructura académica
app.get('/auto-setup-academic-structure', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        console.log(`Auto-setup estructura académica para colegio ${schoolId}...`);
        
        // 1. Obtener todos los grados únicos de students
        const { rows: gradesData } = await db.query(
            'SELECT DISTINCT grade FROM students WHERE school_id = $1 AND grade IS NOT NULL',
            [schoolId]
        );
        
        const grades = gradesData.map(r => r.grade).filter(g => g);
        console.log('Grados encontrados:', grades);
        
        // 2. Materias estándar del currículo
        const standardSubjects = [
            'Matemáticas', 'Lenguaje', 'Ciencias Naturales', 'Ciencias Sociales',
            'Inglés', 'Educación Física', 'Arte y Música', 'Tecnología', 'Ética y Valores'
        ];
        
        // 3. Crear subjects si no existen
        for (const subjectName of standardSubjects) {
            await db.query(`
                INSERT INTO subjects (school_id, name, is_active)
                VALUES ($1, $2, true)
                ON CONFLICT (school_id, name) DO NOTHING
            `, [schoolId, subjectName]);
        }
        console.log('✅ Subjects creados');
        
        // 4. Para cada grado, crear cursos
        let coursesCreated = 0;
        for (const grade of grades) {
            for (const subjectName of standardSubjects) {
                // Verificar si ya existe el curso
                const { rows: existing } = await db.query(
                    'SELECT id FROM courses WHERE school_id = $1 AND grade_level = $2 AND name LIKE $3',
                    [schoolId, grade, `%${subjectName}%`]
                );
                
                if (existing.length === 0) {
                    // Obtener subject_id
                    const { rows: subj } = await db.query(
                        'SELECT id FROM subjects WHERE school_id = $1 AND name = $2',
                        [schoolId, subjectName]
                    );
                    
                    await db.query(`
                        INSERT INTO courses (school_id, name, grade_level, section, subject_id)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [schoolId, `${subjectName} - ${grade}`, grade, 'A', subj[0]?.id || null]);
                    
                    coursesCreated++;
                }
            }
        }
        console.log(`✅ ${coursesCreated} cursos creados`);
        
        // 5. Auto-matricular estudiantes (usando estructura existente de enrollments)
        const { rows: students } = await db.query(
            'SELECT id, grade FROM students WHERE school_id = $1 AND grade IS NOT NULL',
            [schoolId]
        );
        
        // Obtener período activo más reciente
        const { rows: periods } = await db.query(
            'SELECT id FROM academic_periods WHERE school_id = $1 AND is_active = true ORDER BY year DESC LIMIT 1',
            [schoolId]
        );
        const periodId = periods[0]?.id;
        const currentYear = new Date().getFullYear();
        
        let enrollmentsCreated = 0;
        for (const student of students) {
            if (student.grade) {
                // Verificar si ya existe matrícula
                const { rows: existing } = await db.query(
                    'SELECT id FROM enrollments WHERE student_id = $1 AND school_id = $2 AND academic_year = $3',
                    [student.id, schoolId, currentYear]
                );
                
                if (existing.length === 0) {
                    // Insertar nueva matrícula
                    await db.query(`
                        INSERT INTO enrollments (student_id, school_id, academic_year, grade, status, enrollment_date)
                        VALUES ($1, $2, $3, $4, 'active', CURRENT_DATE)
                    `, [student.id, schoolId, currentYear, student.grade]);
                    enrollmentsCreated++;
                }
            }
        }
        console.log(`✅ ${enrollmentsCreated} matrículas creadas/actualizadas`);
        
        res.json({
            success: true,
            message: 'Estructura académica auto-configurada exitosamente',
            grades: grades.length,
            courses_created: coursesCreated,
            enrollments_created: enrollmentsCreated
        });
    } catch (err) {
        console.error('Error en auto-setup:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para auto-crear profesores por materia
app.get('/auto-create-teachers', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        console.log(`Auto-crear profesores para colegio ${schoolId}...`);
        
        // Materias estándar
        const standardSubjects = [
            'Matemáticas', 'Lenguaje', 'Ciencias Naturales', 'Ciencias Sociales',
            'Inglés', 'Educación Física', 'Arte y Música', 'Tecnología', 'Ética y Valores'
        ];
        
        let teachersCreated = 0;
        
        for (const subject of standardSubjects) {
            // Verificar si ya existe profesor para esta materia en este colegio
            const { rows: existing } = await db.query(`
                SELECT t.id FROM teachers t
                JOIN users u ON t.user_id = u.id
                WHERE u.school_id = $1 AND t.subject ILIKE $2
            `, [schoolId, `%${subject}%`]);
            
            if (existing.length === 0) {
                // Crear usuario primero
                const email = `prof.${subject.toLowerCase().replace(/\s+/g, '.')}@school${schoolId}.edu`;
                const password = await bcrypt.hash('profesor123', 10);
                
                const { rows: userRows } = await db.query(`
                    INSERT INTO users (name, email, password, role, school_id)
                    VALUES ($1, $2, $3, 'teacher', $4)
                    ON CONFLICT (email) DO NOTHING
                    RETURNING id
                `, [`Prof. ${subject}`, email, password, schoolId]);
                
                if (userRows.length > 0) {
                    const userId = userRows[0].id;
                    
                    // Crear profesor
                    await db.query(`
                        INSERT INTO teachers (user_id, subject, status)
                        VALUES ($1, $2, 'active')
                    `, [userId, subject]);
                    
                    teachersCreated++;
                }
            }
        }
        
        console.log(`✅ ${teachersCreated} profesores creados`);
        
        res.json({
            success: true,
            message: `Se crearon ${teachersCreated} profesores exitosamente`,
            teachers_created: teachersCreated,
            default_password: 'profesor123'
        });
    } catch (err) {
        console.error('Error creando profesores:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ejecutar inicialización y luego arrancar servidor
initializeDatabase().then(() => {
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
});
