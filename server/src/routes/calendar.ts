import { FastifyInstance } from 'fastify';
import db from '../db';
import { randomUUID } from 'crypto';

interface Calendar {
    service_id: string;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    start_date: string;
    end_date: string;
}

export default async function calendarRoutes(server: FastifyInstance) {

    // GET /calendar - List all
    server.get('/calendar', async (request, reply) => {
        try {
            const calendars = db.prepare('SELECT * FROM calendar ORDER BY service_id').all();
            return calendars;
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch calendars' });
        }
    });

    // POST /calendar - Create new
    server.post<{ Body: Calendar }>('/calendar', async (request, reply) => {
        const { service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date } = request.body;

        if (!service_id || !start_date || !end_date) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }

        try {
            const stmt = db.prepare(`
                INSERT INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date);
            return { message: 'Calendar created', service_id };
        } catch (err: any) {
            if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                return reply.status(409).send({ error: 'Service ID already exists' });
            }
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to create calendar' });
        }
    });

    // PUT /calendar/:service_id - Update
    server.put<{ Params: { service_id: string }, Body: Calendar }>('/calendar/:service_id', async (request, reply) => {
        const { service_id: old_service_id } = request.params;
        const { service_id: new_service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date } = request.body;

        try {
            // If renaming, check if new ID exists
            if (new_service_id !== old_service_id) {
                const existing = db.prepare('SELECT service_id FROM calendar WHERE service_id = ?').get(new_service_id);
                if (existing) {
                    return reply.status(409).send({ error: 'New Service ID already exists' });
                }
            }

            const updateCalendar = db.transaction(() => {
                // Update Calendar
                const stmt = db.prepare(`
                    UPDATE calendar 
                    SET service_id = ?, monday = ?, tuesday = ?, wednesday = ?, thursday = ?, friday = ?, saturday = ?, sunday = ?, start_date = ?, end_date = ?
                    WHERE service_id = ?
                `);
                const info = stmt.run(new_service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date, old_service_id);

                if (info.changes === 0) {
                    throw new Error('Calendar not found');
                }

                // Update Trips if renamed
                if (new_service_id !== old_service_id) {
                    db.prepare('UPDATE trips SET service_id = ? WHERE service_id = ?').run(new_service_id, old_service_id);
                }
            });

            updateCalendar();
            return { message: 'Calendar updated' };
        } catch (err: any) {
            if (err.message === 'Calendar not found') {
                return reply.status(404).send({ error: 'Calendar not found' });
            }
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to update calendar' });
        }
    });

    // DELETE /calendar/:service_id - Delete
    server.delete<{ Params: { service_id: string } }>('/calendar/:service_id', async (request, reply) => {
        const { service_id } = request.params;
        try {
            // Check for dependencies in trips table? For now, just delete.
            // Ideally we should alert if used, but simple delete for now.
            const stmt = db.prepare('DELETE FROM calendar WHERE service_id = ?');
            const info = stmt.run(service_id);

            if (info.changes === 0) {
                return reply.status(404).send({ error: 'Calendar not found' });
            }
            return { message: 'Calendar deleted' };
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to delete calendar' });
        }
    });
}
