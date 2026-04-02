const router = require('express').Router();
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

router.get('/', auth, async (req, res) => {
    try {
        let query = 'SELECT * FROM payments WHERE school_id = $1';
        let params = [req.user.school_id];

        if (req.user.role === 'parent') {
            const user = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
            query = `
                SELECT p.*
                FROM payments p
                JOIN students s ON p.student_id = s.id
                WHERE p.school_id = $2
                  AND (
                    s.parent_email = $1 OR EXISTS (
                        SELECT 1
                        FROM student_parents sp
                        JOIN parents pr ON pr.id = sp.parent_id
                        WHERE sp.student_id = s.id AND pr.email = $1
                    )
                  )
            `;
            params = [user.rows[0].email, req.user.school_id];
        }

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/checkout', auth, async (req, res) => {
    if (req.user.role !== 'parent') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { student_id, enrollment_id, amount, currency, method, flow, country } = req.body;

    if (!student_id || !method) {
        return res.status(400).json({ error: 'student_id and method are required' });
    }

    const normalizedCurrency = (currency || 'BOB').toUpperCase();
    if (!['BOB', 'USD'].includes(normalizedCurrency)) {
        return res.status(400).json({ error: 'Unsupported currency' });
    }

    const normalizedMethod = method.toLowerCase();
    if (!['card', 'qr'].includes(normalizedMethod)) {
        return res.status(400).json({ error: 'Unsupported method' });
    }

    const normalizedFlow = (flow || 'direct').toLowerCase();
    if (!['direct', 'redirect'].includes(normalizedFlow)) {
        return res.status(400).json({ error: 'Unsupported flow' });
    }

    if (normalizedMethod === 'qr' && normalizedFlow !== 'direct') {
        return res.status(400).json({ error: 'QR payments must use direct flow' });
    }

    try {
        const { rows: userRows } = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
        const parentEmail = userRows[0]?.email;
        if (!parentEmail) {
            return res.status(400).json({ error: 'Parent email not found' });
        }

        const { rows: studentRows } = await db.query(
            `
            SELECT s.id
            FROM students s
            WHERE s.id = $1
              AND s.school_id = $2
              AND (
                s.parent_email = $3 OR EXISTS (
                    SELECT 1
                    FROM student_parents sp
                    JOIN parents p ON p.id = sp.parent_id
                    WHERE sp.student_id = s.id AND p.email = $3
                )
              )
            `,
            [student_id, req.user.school_id, parentEmail]
        );

        if (studentRows.length === 0) {
            return res.status(404).json({ error: 'Student not found for this parent' });
        }

        let enrollmentAmount = null;
        if (enrollment_id) {
            const { rows: enrollmentRows } = await db.query(
                `
                SELECT id, tuition_fee, payment_status
                FROM enrollments
                WHERE id = $1 AND student_id = $2 AND school_id = $3
                `,
                [enrollment_id, student_id, req.user.school_id]
            );
            if (enrollmentRows.length === 0) {
                return res.status(404).json({ error: 'Enrollment not found for this student' });
            }
            enrollmentAmount = enrollmentRows[0].tuition_fee;
        }

        const finalAmount = amount ?? enrollmentAmount;
        if (!finalAmount || Number(finalAmount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const provider = 'dlocal';
        const providerRef = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const metadata = {
            country: country || null,
            invoice_provider: 'CLIC',
            invoice_status: 'pending'
        };

        const { rows } = await db.query(
            `
            INSERT INTO payments (student_id, amount, date, status, school_id, provider, provider_ref, currency, method, flow, invoice_provider, invoice_status, metadata)
            VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            `,
            [
                student_id,
                finalAmount,
                'pending',
                req.user.school_id,
                provider,
                providerRef,
                normalizedCurrency,
                normalizedMethod,
                normalizedFlow,
                'CLIC',
                'pending',
                JSON.stringify(metadata)
            ]
        );

        const payment = rows[0];
        const checkout = {
            provider,
            flow: normalizedFlow,
            method: normalizedMethod,
            message: normalizedMethod === 'qr'
                ? 'Escanea este QR desde tu app bancaria para completar el pago.'
                : 'Completa el pago con tu tarjeta.'
        };

        if (normalizedMethod === 'qr') {
            checkout.qr_payload = `PAYMENT|${providerRef}|${normalizedCurrency}|${finalAmount}`;
        } else if (normalizedFlow === 'redirect') {
            checkout.redirect_url = `https://checkout.example.com/${providerRef}`;
        } else {
            checkout.client_reference = providerRef;
        }

        res.json({ payment, checkout });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/confirm', auth, async (req, res) => {
    if (req.user.role !== 'parent') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { payment_id } = req.body;
    if (!payment_id) {
        return res.status(400).json({ error: 'payment_id is required' });
    }

    try {
        const { rows: userRows } = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
        const parentEmail = userRows[0]?.email;

        const { rows: paymentRows } = await db.query(
            `
            SELECT p.*, s.id as student_id
            FROM payments p
            JOIN students s ON p.student_id = s.id
            WHERE p.id = $1
              AND p.school_id = $2
              AND (
                s.parent_email = $3 OR EXISTS (
                    SELECT 1
                    FROM student_parents sp
                    JOIN parents pr ON pr.id = sp.parent_id
                    WHERE sp.student_id = s.id AND pr.email = $3
                )
              )
            `,
            [payment_id, req.user.school_id, parentEmail]
        );

        if (paymentRows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const payment = paymentRows[0];

        const { rows } = await db.query(
            `
            UPDATE payments
            SET status = 'paid', invoice_status = 'queued'
            WHERE id = $1 AND school_id = $2
            RETURNING *
            `,
            [payment_id, req.user.school_id]
        );

        await db.query(
            `
            UPDATE enrollments
            SET payment_status = 'paid'
            WHERE student_id = $1 AND school_id = $2 AND academic_year = EXTRACT(YEAR FROM CURRENT_DATE)
            `,
            [payment.student_id, req.user.school_id]
        );

        res.json({ payment: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/webhook/dlocal', async (req, res) => {
    const secret = process.env.DLOCAL_SECRET_KEY;
    if (secret) {
        return res.status(501).json({ error: 'Webhook signature verification not implemented yet.' });
    }

    try {
        const payload = req.body || {};
        const providerRef =
            payload.reference_id ||
            payload.payment_id ||
            payload.id ||
            payload.payment?.id ||
            payload.data?.id ||
            payload.data?.payment_id ||
            payload.data?.reference_id;

        if (!providerRef) {
            return res.status(400).json({ error: 'provider_ref not found in webhook payload' });
        }

        const status = (payload.status || payload.data?.status || 'pending').toString().toLowerCase();
        const mappedStatus = ['approved', 'paid', 'success'].includes(status) ? 'paid' : status;

        const { rows } = await db.query(
            `
            UPDATE payments
            SET status = COALESCE($1, status),
                metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
            WHERE provider_ref = $3
            RETURNING *
            `,
            [
                mappedStatus,
                JSON.stringify({ dlocal_webhook: payload, last_webhook_at: new Date().toISOString() }),
                providerRef
            ]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found for provider_ref' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', [auth, authorize(['admin'])], async (req, res) => {
    const { student_id, amount, date, status } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO payments (student_id, amount, date, status, school_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [student_id, amount, date, status, req.user.school_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', [auth, authorize(['admin'])], async (req, res) => {
    const { id } = req.params;
    const { student_id, amount, date, status } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE payments SET student_id = $1, amount = $2, date = $3, status = $4 WHERE id = $5 AND school_id = $6 RETURNING *',
            [student_id, amount, date, status, id, req.user.school_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Payment not found or access denied' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', [auth, authorize(['admin'])], async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await db.query(
            'DELETE FROM payments WHERE id = $1 AND school_id = $2',
            [id, req.user.school_id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Payment not found or access denied' });
        res.json({ message: 'Payment deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
