const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db', // Change to 'db' for internal docker network if 'localhost' fails
  user: process.env.DB_USER || 'saas_user',
  password: process.env.DB_PASS || 'saas_password',
  database: process.env.DB_NAME || 'saas_db',
  port: 5432,
});

(async () => {
    try {
        console.log('--- FIXING DATABASE SCHEMA & AVERAGES ---');

        // 1. Ensure columns exist (Add status, average, etc.)
        console.log('Ensuring columns exist...');
        await pool.query("ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS general_average DECIMAL(5,2)");
        await pool.query("ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'");
        await pool.query("ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS behavior_grade DECIMAL(5,2)");
        await pool.query("ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS comments TEXT");
        console.log('Schema update complete.');

        // 2. Recalculate averages for ALL report cards
        console.log('Recalculating averages...');

        const { rows: cards } = await pool.query('SELECT id FROM report_cards');

        for (const card of cards) {
            // Get details for this report card
            const { rows: details } = await pool.query(
                'SELECT score FROM report_card_details WHERE report_card_id = $1',
                [card.id]
            );

            if (details.length > 0) {
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

                await pool.query(
                    'UPDATE report_cards SET general_average = $1 WHERE id = $2',
                    [average, card.id]
                );
                console.log(`Report Card ${card.id}: Updated average to ${average} (${count} grades)`);
            } else {
                console.log(`Report Card ${card.id}: No grades found, skipping.`);
            }
        }

        console.log('--- COMPLETED SUCCESSFULLY ---');

    } catch (err) {
        console.error('ERROR:', err);
    }
    setTimeout(() => {
        pool.end();
    }, 1000);
})();