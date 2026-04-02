CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'teacher', 'parent')),
    school_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    grade VARCHAR(50) NOT NULL,
    parent_email VARCHAR(255) NOT NULL,
    school_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS grades (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    course_id INT REFERENCES courses(id),
    subject VARCHAR(255) NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    school_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    course_id INT REFERENCES courses(id),
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    school_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    amount DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    provider VARCHAR(50) DEFAULT 'dlocal',
    provider_ref VARCHAR(120),
    currency VARCHAR(10) DEFAULT 'BOB',
    method VARCHAR(20),
    flow VARCHAR(20),
    invoice_provider VARCHAR(50) DEFAULT 'CLIC',
    invoice_status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB,
    school_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    school_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_settings (
    id SERIAL PRIMARY KEY,
    school_id INT UNIQUE NOT NULL,
    grade_scale VARCHAR(20) DEFAULT '0-7' CHECK (grade_scale IN ('0-7', '0-100', 'A-F')),
    currency VARCHAR(10) DEFAULT 'USD',
    academic_year VARCHAR(20) DEFAULT '2024',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Academic Periods (Bimesters/Trimesters)
CREATE TABLE IF NOT EXISTS academic_periods (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL,
    name VARCHAR(50) NOT NULL, -- 'Primer Bimestre', 'Segundo Bimestre', etc.
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    year INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Report Cards
CREATE TABLE IF NOT EXISTS report_cards (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    period_id INT REFERENCES academic_periods(id),
    year INT NOT NULL,
    issue_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    general_average DECIMAL(5,2),
    behavior_grade VARCHAR(10),
    attendance_days INT DEFAULT 0,
    total_days INT DEFAULT 0,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, period_id, year)
);

-- Report Card Details (Grades by Subject)
CREATE TABLE IF NOT EXISTS report_card_details (
    id SERIAL PRIMARY KEY,
    report_card_id INT REFERENCES report_cards(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id),
    subject_name VARCHAR(255) NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    weighted_score DECIMAL(5,2),
    behavior_grade VARCHAR(10),
    teacher_id INT REFERENCES users(id),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student Credentials for Portal Access
CREATE TABLE IF NOT EXISTS student_credentials (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. SCHOOLS / UNIDADES EDUCATIVAS
CREATE TABLE IF NOT EXISTS schools (
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
    school_type VARCHAR(50) CHECK (school_type IN ('public', 'private', 'charter')),
    education_level VARCHAR(50) CHECK (education_level IN ('initial', 'primary', 'secondary', 'technical', 'university')),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Bolivia',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ENROLLMENTS / MATRICULAS
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    academic_year INT NOT NULL,
    grade VARCHAR(50) NOT NULL,
    section VARCHAR(10),
    enrollment_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'retired', 'graduated', 'transferred', 'suspended')),
    tuition_fee DECIMAL(10,2),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'partial', 'waived')),
    previous_school VARCHAR(255),
    observations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, school_id, academic_year)
);

-- 3. SCHEDULES / HORARIOS
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id INT REFERENCES users(id) ON DELETE SET NULL,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    classroom VARCHAR(50),
    academic_year INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. ANNOUNCEMENTS / COMUNICADOS
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) CHECK (category IN ('general', 'academic', 'administrative', 'sports', 'cultural', 'urgent')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    target_audience VARCHAR(50) DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'parents', 'teachers', 'admin')),
    publish_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    is_pinned BOOLEAN DEFAULT false,
    attachment_url TEXT,
    created_by INT REFERENCES users(id),
    views_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. PARENTS / TUTORES
CREATE TABLE IF NOT EXISTS parents (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50) CHECK (relationship IN ('father', 'mother', 'guardian', 'other')),
    document_type VARCHAR(20) CHECK (document_type IN ('ci', 'passport', 'foreign_id')),
    document_number VARCHAR(50),
    phone VARCHAR(50),
    phone_alt VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    occupation VARCHAR(100),
    workplace VARCHAR(255),
    student_id INT, -- Temporally keep for legacy or ease
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student-Parent Relationship
CREATE TABLE IF NOT EXISTS student_parents (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    parent_id INT REFERENCES parents(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    can_pickup BOOLEAN DEFAULT true,
    emergency_contact BOOLEAN DEFAULT false,
    UNIQUE(student_id, parent_id)
);

-- 6. DOCUMENTS / EXPEDIENTE
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('birth_certificate', 'id_card', 'photo', 'vaccination_card', 'previous_school_records', 'behavior_certificate', 'medical_record', 'other')),
    document_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INT,
    mime_type VARCHAR(100),
    description TEXT,
    upload_date DATE DEFAULT CURRENT_DATE,
    is_verified BOOLEAN DEFAULT false,
    verified_by INT REFERENCES users(id),
    verified_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. EVENTS / CALENDARIO
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) CHECK (event_type IN ('academic', 'administrative', 'sports', 'cultural', 'holiday', 'exam', 'meeting', 'other')),
    start_date DATE NOT NULL,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    location VARCHAR(255),
    is_all_day BOOLEAN DEFAULT false,
    is_holiday BOOLEAN DEFAULT false,
    is_lective BOOLEAN DEFAULT true,
    target_audience VARCHAR(50) DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'parents', 'teachers', 'admin')),
    organizer_id INT REFERENCES users(id),
    attachment_url TEXT,
    color VARCHAR(20) DEFAULT '#3b82f6',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event Attendees
CREATE TABLE IF NOT EXISTS event_attendees (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES events(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    attendance_status VARCHAR(20) DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'confirmed', 'declined', 'attended')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);
