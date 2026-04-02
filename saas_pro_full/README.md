
# SaaS PRO Escolar

## Ejecutar
docker-compose up --build

## Endpoints
POST /auth/login
GET /students
POST /students

## Multi-tenant
Agregar campo colegio_id en cada entidad

1. Configurar malla curricular base (una vez)
   - Subjects: Matemáticas, Lenguaje, etc.

2. Crear oferta académica del período
   - Courses: "Matemáticas 4TO A", "Lenguaje 4TO A"

3. Matricular estudiantes (enrollments)
   - Juan Pérez → Matemáticas 4TO A, Lenguaje 4TO A, etc.

4. Asignar profesores
   - Prof. García → Matemáticas 4TO A

5. Cargar calificaciones
   - Seleccionas curso de una lista (FK)
   - NO escribes el nombre