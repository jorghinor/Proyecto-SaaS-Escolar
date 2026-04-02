const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

// --- HELPER FUNCTION: Recalculate Average ---
async function updateReportCardAverage(reportCardId) {
    try {
        // 1. Get all scores for this report card
        const { rows: details } = await db.query(
            'SELECT score FROM report_card_details WHERE report_card_id = $1',
            [reportCardId]
        );

        if (details.length === 0) {
            // No grades, reset average to null or 0
            await db.query('UPDATE report_cards SET general_average = NULL WHERE id = $1', [reportCardId]);
            return;
        }

        // 2. Calculate average
        let sum = 0;
        let count = 0;
        for (const d of details) {
            const val = parseFloat(d.score);
            if (!isNaN(val)) {
                sum += val;
                count++;
            }
        }

        const average = count > 0 ? (sum / count).toFixed(2) : 0;

        // 3. Update the main table
        await db.query(
            'UPDATE report_cards SET general_average = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [average, reportCardId]
        );

        console.log(`Updated average for ReportCard ${reportCardId}: ${average}`);
    } catch (err) {
        console.error('Error updating average:', err);
    }
}

// GET /report-cards - Get all report cards with pagination, search and filters
router.get('/', auth, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            student_id, 
            period_id, 
            year,
            status 
        } = req.query;
        
        const offset = (page - 1) * limit;
        const schoolId = req.user.school_id;
        
        let query = `
            SELECT rc.*, s.name as student_name, s.grade as student_grade,
                   ap.name as period_name, ap.start_date, ap.end_date
            FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            LEFT JOIN academic_periods ap ON rc.period_id = ap.id
            WHERE s.school_id = $1
        `;
        
        let countQuery = `
            SELECT COUNT(*) 
            FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            WHERE s.school_id = $1
        `;
        
        const params = [schoolId];
        let paramCount = 1;
        
        if (search) {
            paramCount++;
            query += ` AND s.name ILIKE $${paramCount}`;
            countQuery += ` AND s.name ILIKE $${paramCount}`;
            params.push(`%${search}%`);
        }
        
        if (student_id) {
            paramCount++;
            query += ` AND rc.student_id = $${paramCount}`;
            countQuery += ` AND rc.student_id = $${paramCount}`;
            params.push(student_id);
        }
        
        if (period_id) {
            paramCount++;
            query += ` AND rc.period_id = $${paramCount}`;
            countQuery += ` AND rc.period_id = $${paramCount}`;
            params.push(period_id);
        }
        
        if (year) {
            paramCount++;
            query += ` AND rc.year = $${paramCount}`;
            countQuery += ` AND rc.year = $${paramCount}`;
            params.push(year);
        }
        
        if (status) {
            paramCount++;
            query += ` AND rc.status = $${paramCount}`;
            countQuery += ` AND rc.status = $${paramCount}`;
            params.push(status);
        }
        
        query += ` ORDER BY rc.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);
        
        const { rows } = await db.query(query, params);
        const countResult = await db.query(countQuery, params.slice(0, -2));
        const total = parseInt(countResult.rows[0].count);
        
        res.json({
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching report cards:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /report-cards/:id - Get single report card with details
router.get('/:id', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        
        // Get report card
        const { rows: reportCards } = await db.query(`
            SELECT rc.*, s.name as student_name, s.grade as student_grade,
                   ap.name as period_name
            FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            LEFT JOIN academic_periods ap ON rc.period_id = ap.id
            WHERE rc.id = $1 AND s.school_id = $2
        `, [req.params.id, schoolId]);
        
        if (reportCards.length === 0) {
            return res.status(404).json({ error: 'Report card not found' });
        }
        
        // Get details
        const { rows: details } = await db.query(`
            SELECT rcd.*, c.name as course_name, u.name as teacher_name
            FROM report_card_details rcd
            LEFT JOIN courses c ON rcd.course_id = c.id
            LEFT JOIN users u ON rcd.teacher_id = u.id
            WHERE rcd.report_card_id = $1
            ORDER BY rcd.subject_name
        `, [req.params.id]);
        
        res.json({
            ...reportCards[0],
            details
        });
    } catch (err) {
        console.error('Error fetching report card:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /report-cards - Create new report card
router.post('/', auth, async (req, res) => {
    try {
        const { student_id, period_id, year, behavior_grade, comments } = req.body;
        const schoolId = req.user.school_id;
        
        // Verify student belongs to school
        const studentCheck = await db.query(
            'SELECT id FROM students WHERE id = $1 AND school_id = $2',
            [student_id, schoolId]
        );
        
        if (studentCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Student not found in your school' });
        }
        
        const { rows } = await db.query(`
            INSERT INTO report_cards (student_id, period_id, year, behavior_grade, comments)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [student_id, period_id, year, behavior_grade, comments]);
        
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error creating report card:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /report-cards/:id - Update report card
router.put('/:id', auth, async (req, res) => {
    try {
        const { status, behavior_grade, comments, general_average } = req.body;
        const schoolId = req.user.school_id;
        
        // Verify ownership
        const checkResult = await db.query(`
            SELECT rc.id FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            WHERE rc.id = $1 AND s.school_id = $2
        `, [req.params.id, schoolId]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report card not found' });
        }
        
        // Build dynamic update query
        let updateQuery = 'UPDATE report_cards SET updated_at = CURRENT_TIMESTAMP';
        const params = [];
        let paramCount = 0;

        if (status !== undefined) {
            paramCount++;
            updateQuery += `, status = $${paramCount}`;
            params.push(status);
        }
        if (behavior_grade !== undefined) {
            paramCount++;
            updateQuery += `, behavior_grade = $${paramCount}`;
            params.push(behavior_grade);
        }
        if (comments !== undefined) {
            paramCount++;
            updateQuery += `, comments = $${paramCount}`;
            params.push(comments);
        }
        if (general_average !== undefined) {
            paramCount++;
            updateQuery += `, general_average = $${paramCount}`;
            params.push(general_average);
        }

        paramCount++;
        updateQuery += ` WHERE id = $${paramCount} RETURNING *`;
        params.push(req.params.id);

        const { rows } = await db.query(updateQuery, params);
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating report card:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /report-cards/:id - Delete report card
router.delete('/:id', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        
        // Verify ownership
        const checkResult = await db.query(`
            SELECT rc.id FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            WHERE rc.id = $1 AND s.school_id = $2
        `, [req.params.id, schoolId]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report card not found' });
        }
        
        await db.query('DELETE FROM report_cards WHERE id = $1', [req.params.id]);
        res.json({ message: 'Report card deleted successfully' });
    } catch (err) {
        console.error('Error deleting report card:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /report-cards/:id/details - Add grade detail
router.post('/:id/details', auth, async (req, res) => {
    try {
        const { course_id, subject_name, score, behavior_grade, teacher_id, comments } = req.body;
        const reportCardId = req.params.id;
        
        const { rows } = await db.query(`
            INSERT INTO report_card_details 
            (report_card_id, course_id, subject_name, score, behavior_grade, teacher_id, comments)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [reportCardId, course_id, subject_name, score, behavior_grade, teacher_id, comments]);
        
        // Recalculate average
        await updateReportCardAverage(reportCardId);

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error adding report card detail:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /report-cards/details/:detailId - Update grade detail
router.put('/details/:detailId', auth, async (req, res) => {
    try {
        const { course_id, subject_name, score, behavior_grade, teacher_id, comments } = req.body;
        
        const { rows } = await db.query(`
            UPDATE report_card_details 
            SET course_id = $1,
                subject_name = $2,
                score = $3,
                behavior_grade = $4,
                teacher_id = $5,
                comments = $6
            WHERE id = $7
            RETURNING *
        `, [course_id, subject_name, score, behavior_grade, teacher_id, comments, req.params.detailId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Detail not found' });
        }

        // Recalculate average using the parent report_card_id
        await updateReportCardAverage(rows[0].report_card_id);

        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating detail:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /report-cards/:id/details/:detailId - Delete grade detail
router.delete('/:id/details/:detailId', auth, async (req, res) => {
    try {
        const { id, detailId } = req.params;
        
        // Verify the detail belongs to this report card
        const { rows } = await db.query(
            'SELECT * FROM report_card_details WHERE id = $1 AND report_card_id = $2',
            [detailId, id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Detail not found' });
        }
        
        await db.query('DELETE FROM report_card_details WHERE id = $1', [detailId]);

        // Recalculate average
        await updateReportCardAverage(id);

        res.json({ message: 'Detail deleted successfully' });
    } catch (err) {
        console.error('Error deleting detail:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /report-cards/student/:studentId - Get all report cards for a student
router.get('/student/:studentId', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const { year } = req.query;
        
        let query = `
            SELECT rc.*, ap.name as period_name
            FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            LEFT JOIN academic_periods ap ON rc.period_id = ap.id
            WHERE rc.student_id = $1 AND s.school_id = $2
        `;
        
        const params = [req.params.studentId, schoolId];
        
        if (year) {
            query += ` AND rc.year = $3`;
            params.push(year);
        }
        
        query += ` ORDER BY rc.year DESC, ap.start_date DESC`;
        
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching student report cards:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /report-cards/:id/pdf - Generate PDF report card
router.get('/:id/pdf', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const reportCardId = req.params.id;
        
        console.log('=== GENERANDO PDF ===');
        console.log('User school_id:', schoolId);
        console.log('Report card ID:', reportCardId);
        
        // Get report card with student info and school name
        const { rows: reportCards } = await db.query(`
            SELECT rc.*, s.name as student_name, s.grade as student_grade,
                   s.parent_email, ap.name as period_name, ap.start_date, ap.end_date,
                   sch.name as school_name
            FROM report_cards rc
            JOIN students s ON rc.student_id = s.id
            LEFT JOIN academic_periods ap ON rc.period_id = ap.id
            LEFT JOIN schools sch ON s.school_id = sch.id
            WHERE rc.id = $1 AND s.school_id = $2
        `, [reportCardId, schoolId]);
        
        if (reportCards.length === 0) {
            return res.status(404).json({ error: 'Report card not found' });
        }
        
        const reportCard = reportCards[0];
        
        console.log('School name from DB:', reportCard.school_name);
        
        // Get details
        const { rows: details } = await db.query(`
            SELECT rcd.*, c.name as course_name, u.name as teacher_name
            FROM report_card_details rcd
            LEFT JOIN courses c ON rcd.course_id = c.id
            LEFT JOIN users u ON rcd.teacher_id = u.id
            WHERE rcd.report_card_id = $1
            ORDER BY rcd.subject_name
        `, [reportCardId]);
        
        // Generate PDF
        const doc = new jsPDF();
        const schoolName = reportCard.school_name || 'UNIDAD EDUCATIVA';
        
        // Header
        doc.setFontSize(20);
        doc.setTextColor(0, 51, 102);
        doc.text(schoolName, 105, 20, { align: 'center' });
        
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text('LIBRETA DE CALIFICACIONES', 105, 30, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text(`Gestión ${reportCard.year}`, 105, 38, { align: 'center' });
        
        // Student Info Box
        doc.setDrawColor(0, 51, 102);
        doc.setLineWidth(0.5);
        doc.rect(10, 45, 190, 35);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTUDIANTE:', 15, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(reportCard.student_name, 55, 55);
        
        doc.setFont('helvetica', 'bold');
        doc.text('GRADO/CURSO:', 15, 65);
        doc.setFont('helvetica', 'normal');
        doc.text(reportCard.student_grade, 55, 65);
        
        doc.setFont('helvetica', 'bold');
        doc.text('PERÍODO:', 120, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(reportCard.period_name || 'N/A', 150, 55);
        
        doc.setFont('helvetica', 'bold');
        doc.text('FECHA:', 120, 65);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date().toLocaleDateString('es-ES'), 150, 65);
        
        // Grades Table - Use course_name if subject_name is null
        const tableData = details.map(d => [
            d.subject_name || d.course_name || '-',
            (typeof d.score === 'string' ? parseFloat(d.score) : d.score).toString(),
            getLiteralGrade(typeof d.score === 'string' ? parseFloat(d.score) : d.score),
            d.behavior_grade !== null && d.behavior_grade !== undefined ? (typeof d.behavior_grade === 'string' ? parseFloat(d.behavior_grade) : d.behavior_grade).toFixed(1) : '-'
        ]);
        
        doc.autoTable({
            startY: 90,
            head: [['MATERIA', 'NOTA', 'CALIFICACIÓN', 'CONDUCTA']],
            body: tableData,
            theme: 'grid',
            headStyles: {
                fillColor: [0, 51, 102],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            bodyStyles: {
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'left', cellWidth: 80 }
            },
            styles: {
                fontSize: 10,
                cellPadding: 5
            }
        });
        
        // Summary
        const finalY = doc.lastAutoTable.finalY + 10;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`PROMEDIO GENERAL: ${reportCard.general_average || 'N/A'}`, 15, finalY);
        
        if (reportCard.behavior_grade) {
            doc.text(`CALIFICACIÓN CONDUCTA: ${reportCard.behavior_grade}`, 15, finalY + 8);
        }
        
        if (reportCard.comments) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('OBSERVACIONES:', 15, finalY + 20);
            doc.text(reportCard.comments, 15, finalY + 28, { maxWidth: 180 });
        }
        
        // Footer with signatures
        const footerY = 250;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        // Teacher signature line
        doc.line(30, footerY, 90, footerY);
        doc.text('Firma del Tutor', 50, footerY + 5, { align: 'center' });
        
        // Director signature line
        doc.line(120, footerY, 180, footerY);
        doc.text('Firma del Director', 150, footerY + 5, { align: 'center' });
        
        // Generate PDF buffer
        const pdfBuffer = doc.output('arraybuffer');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="libreta_${reportCard.student_name.replace(/\s+/g, '_')}_${reportCard.year}.pdf"`);
        res.send(Buffer.from(pdfBuffer));
        
    } catch (err) {
        console.error('Error generating PDF:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /report-cards/bulk-create - Crear libretas masivamente para todos los estudiantes de un grado
router.post('/bulk-create', auth, async (req, res) => {
    try {
        const { grade, period_id, year = new Date().getFullYear() } = req.body;
        
        if (!grade || !period_id) {
            return res.status(400).json({ error: 'Debe especificar grado y período académico' });
        }
        
        // Obtener todos los estudiantes del grado especificado
        const { rows: students } = await db.query(
            'SELECT * FROM students WHERE grade = $1 AND school_id = $2',
            [grade, req.user.school_id]
        );
        
        if (students.length === 0) {
            return res.status(404).json({ error: 'No hay estudiantes en este grado' });
        }
        
        const createdCards = [];
        
        for (const student of students) {
            // Verificar si ya existe la libreta
            const existing = await db.query(
                'SELECT * FROM report_cards WHERE student_id = $1 AND period_id = $2',
                [student.id, period_id]
            );
            
            if (existing.rows.length > 0) {
                createdCards.push({
                    student_name: student.name,
                    status: 'skipped',
                    reason: 'Ya existe'
                });
                continue;
            }
            
            // Crear libreta vacía
            const { rows } = await db.query(`
                INSERT INTO report_cards (student_id, period_id, year)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [student.id, period_id, year]);
            
            createdCards.push({
                student_name: student.name,
                status: 'created',
                report_card_id: rows[0].id
            });
        }
        
        res.json({
            success: true,
            message: `Se crearon ${createdCards.filter(c => c.status === 'created').length} libretas`,
            total: students.length,
            created: createdCards.filter(c => c.status === 'created').length,
            skipped: createdCards.filter(c => c.status === 'skipped').length,
            data: createdCards
        });
    } catch (err) {
        console.error('Error creating bulk report cards:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /report-cards/copy-from-period - Copiar libretas de un período a otro
router.post('/copy-from-period', auth, async (req, res) => {
    try {
        const { from_period_id, to_period_id, grade, year = new Date().getFullYear() } = req.body;
        
        if (!from_period_id || !to_period_id) {
            return res.status(400).json({ error: 'Debe especificar período de origen y destino' });
        }
        
        // Obtener estudiantes del grado (si se especificó)
        const studentsQuery = grade 
            ? 'SELECT * FROM students WHERE grade = $1 AND school_id = $2'
            : 'SELECT * FROM students WHERE school_id = $1';
        const params = grade ? [grade, req.user.school_id] : [req.user.school_id];
        
        const { rows: students } = await db.query(studentsQuery, params);
        
        if (students.length === 0) {
            return res.status(404).json({ error: 'No hay estudiantes' });
        }
        
        const copiedCards = [];
        let totalDetails = 0;
        
        for (const student of students) {
            // Obtener libreta del período origen
            const sourceCard = await db.query(
                'SELECT * FROM report_cards WHERE student_id = $1 AND period_id = $2',
                [student.id, from_period_id]
            );
            
            if (sourceCard.rows.length === 0) {
                copiedCards.push({
                    student_name: student.name,
                    status: 'skipped',
                    reason: 'No tiene libreta en el período origen'
                });
                continue;
            }
            
            // Verificar si ya existe libreta destino
            const destCardCheck = await db.query(
                'SELECT * FROM report_cards WHERE student_id = $1 AND period_id = $2',
                [student.id, to_period_id]
            );
            
            if (destCardCheck.rows.length > 0) {
                copiedCards.push({
                    student_name: student.name,
                    status: 'skipped',
                    reason: 'Ya existe libreta destino'
                });
                continue;
            }
            
            // Crear nueva libreta copiando datos
            const source = sourceCard.rows[0];
            const { rows: newCard } = await db.query(`
                INSERT INTO report_cards (student_id, period_id, year, behavior_grade, comments)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [student.id, to_period_id, year, source.behavior_grade, source.comments]);
            
            // Copiar detalles (calificaciones por materia)
            const { rows: details } = await db.query(
                'SELECT * FROM report_card_details WHERE report_card_id = $1',
                [source.id]
            );
            
            for (const detail of details) {
                await db.query(`
                    INSERT INTO report_card_details (report_card_id, course_id, subject_name, score, behavior_grade, teacher_id, comments)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [newCard[0].id, detail.course_id, detail.subject_name, detail.score, detail.behavior_grade, detail.teacher_id, detail.comments]);
                totalDetails++;
            }
            
            copiedCards.push({
                student_name: student.name,
                status: 'copied',
                report_card_id: newCard[0].id,
                details_count: details.length
            });
        }
        
        res.json({
            success: true,
            message: `Se copiaron ${copiedCards.filter(c => c.status === 'copied').length} libretas con ${totalDetails} calificaciones`,
            total: students.length,
            copied: copiedCards.filter(c => c.status === 'copied').length,
            skipped: copiedCards.filter(c => c.status === 'skipped').length,
            total_details: totalDetails,
            data: copiedCards
        });
    } catch (err) {
        console.error('Error copying report cards:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /report-cards/bulk-pdf - Generar ZIP con múltiples libretas en PDF
router.post('/bulk-pdf', auth, async (req, res) => {
    try {
        const { period_id, grade, year = new Date().getFullYear() } = req.body;
        
        if (!period_id && !grade) {
            return res.status(400).json({ error: 'Debe especificar período o grado' });
        }
        
        // Obtener estudiantes
        let studentsQuery = 'SELECT * FROM students WHERE school_id = $1';
        const queryParams = [req.user.school_id];
        
        if (grade) {
            studentsQuery += ' AND grade = $2';
            queryParams.push(grade);
        }
        
        const { rows: students } = await db.query(studentsQuery, queryParams);
        
        if (students.length === 0) {
            return res.status(404).json({ error: 'No hay estudiantes' });
        }
        
        // Importar jsPDF correctamente
        const { jsPDF } = require('jspdf');
        require('jspdf-autotable');
        const archiver = require('archiver');
        
        // Configurar respuesta como stream ZIP
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="libretas_${grade || 'todos'}_${year}.zip"`);
        
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });
        
        archive.pipe(res);
        
        let generatedCount = 0;
        
        for (const student of students) {
            // Obtener libreta del estudiante
            const reportCardQuery = period_id
                ? 'SELECT * FROM report_cards WHERE student_id = $1 AND period_id = $2'
                : 'SELECT * FROM report_cards WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1';
            const reportCardParams = period_id ? [student.id, period_id] : [student.id];
            
            const { rows: reportCards } = await db.query(reportCardQuery, reportCardParams);
            
            if (reportCards.length === 0) continue;
            
            const reportCard = reportCards[0];
            
            // Obtener detalles
            const { rows: details } = await db.query(
                'SELECT rd.*, c.name as course_name FROM report_card_details rd LEFT JOIN courses c ON rd.course_id = c.id WHERE rd.report_card_id = $1',
                [reportCard.id]
            );
            
            // Obtener nombre del colegio y período
            const { rows: schoolData } = await db.query(`
                SELECT sch.name as school_name, ap.name as period_name
                FROM report_cards rc
                JOIN students s ON rc.student_id = s.id
                LEFT JOIN schools sch ON s.school_id = sch.id
                LEFT JOIN academic_periods ap ON rc.period_id = ap.id
                WHERE rc.id = $1
            `, [reportCard.id]);
            
            const schoolName = schoolData[0]?.school_name || 'UNIDAD EDUCATIVA';
            const periodName = schoolData[0]?.period_name || '';
            
            // Generar PDF
            const doc = new jsPDF();
            
            // Header
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(schoolName.toUpperCase(), 105, 20, { align: 'center' });
            
            doc.setFontSize(14);
            doc.text('LIBRETA DE CALIFICACIONES', 105, 30, { align: 'center' });
            
            doc.setFontSize(12);
            doc.text(`Gestión ${reportCard.year}`, 105, 38, { align: 'center' });
            
            // Student Info Box
            doc.setDrawColor(0, 51, 102);
            doc.setLineWidth(0.5);
            doc.rect(10, 45, 190, 35);
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('ESTUDIANTE:', 15, 55);
            doc.setFont('helvetica', 'normal');
            doc.text(reportCard.student_name || student.name, 55, 55);
            
            doc.setFont('helvetica', 'bold');
            doc.text('GRADO/CURSO:', 15, 65);
            doc.setFont('helvetica', 'normal');
            doc.text(student.grade, 55, 65);
            
            doc.setFont('helvetica', 'bold');
            doc.text('PERÍODO:', 120, 55);
            doc.setFont('helvetica', 'normal');
            doc.text(periodName || 'N/A', 150, 55);
            
            doc.setFont('helvetica', 'bold');
            doc.text('FECHA:', 120, 65);
            doc.setFont('helvetica', 'normal');
            doc.text(new Date().toLocaleDateString('es-ES'), 150, 65);
            
            // Grades Table
            const tableData = details.map(d => [
                d.subject_name || d.course_name || '-',
                (typeof d.score === 'string' ? parseFloat(d.score) : d.score).toString(),
                getLiteralGrade(typeof d.score === 'string' ? parseFloat(d.score) : d.score),
                d.behavior_grade !== null && d.behavior_grade !== undefined ? (typeof d.behavior_grade === 'string' ? parseFloat(d.behavior_grade) : d.behavior_grade).toFixed(1) : '-'
            ]);
            
            doc.autoTable({
                startY: 90,
                head: [['MATERIA', 'NOTA', 'CALIFICACIÓN', 'CONDUCTA']],
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: [0, 51, 102],
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    halign: 'center'
                },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 80 }
                },
                styles: {
                    fontSize: 10,
                    cellPadding: 5
                }
            });
            
            // Summary
            const finalY = doc.lastAutoTable.finalY + 10;
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(`PROMEDIO GENERAL: ${reportCard.general_average || 'N/A'}`, 15, finalY);
            
            if (reportCard.behavior_grade) {
                doc.text(`CALIFICACIÓN CONDUCTA: ${reportCard.behavior_grade}`, 15, finalY + 8);
            }
            
            if (reportCard.comments) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text('OBSERVACIONES:', 15, finalY + 20);
                doc.text(reportCard.comments, 15, finalY + 28, { maxWidth: 180 });
            }
            
            // Footer with signatures
            const footerY = 250;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            doc.line(30, footerY, 90, footerY);
            doc.text('Firma del Tutor', 50, footerY + 5, { align: 'center' });
            
            doc.line(120, footerY, 180, footerY);
            doc.text('Firma del Director', 150, footerY + 5, { align: 'center' });
            
            // Agregar PDF al ZIP
            const pdfBuffer = doc.output('arraybuffer');
            const safeFileName = `${student.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${reportCard.year}.pdf`;
            archive.append(Buffer.from(pdfBuffer), { name: safeFileName });
            
            generatedCount++;
        }
        
        await archive.finalize();
        
        console.log(`ZIP generado con ${generatedCount} libretas`);
        
    } catch (err) {
        console.error('Error generating bulk PDF:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper function to convert numeric grade to literal
function getLiteralGrade(score) {
    if (score >= 6) return 'EXCELENTE';
    if (score >= 5) return 'MUY BUENO';
    if (score >= 4) return 'BUENO';
    if (score >= 3) return 'SUFICIENTE';
    return 'INSUFICIENTE';
}

module.exports = router;
