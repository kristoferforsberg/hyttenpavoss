import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/netlify-db';
import { inventoryCategory, inventoryItems } from '../../db/schema.ts';

const cookieName = '__Host-cabin-inventory';
const cookiePattern = /(?:^|;\s*)__Host-cabin-inventory=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?=;|$)/;
const itemFields = {
    id: inventoryItems.id,
    category: inventoryItems.category,
    name: inventoryItems.name,
    quantity: inventoryItems.quantity,
};

function json(data, status = 200, headers = {}) {
    return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function readItem(request) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return null;
    }
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const quantity = body?.quantity;
    if (!name || name.length > 120 || name.includes('\0') || !Number.isInteger(quantity) || quantity < 1 || quantity > 999999) {
        return null;
    }
    return { name, quantity, category: body.category };
}

export function createInventoryHandler(db) {
    return async function handleInventory(request) {
        const { pathname } = new URL(request.url);
        const collection = /^\/api\/inventory\/?$/.test(pathname);
        const id = Number(pathname.match(/^\/api\/inventory\/([1-9]\d*)\/?$/)?.[1]);
        if (!collection && (!Number.isInteger(id) || id > 2147483647)) {
            return json({ error: 'Fant ikke gjenstanden.' }, 404);
        }

        const method = request.method;
        const allowed = collection ? ['GET', 'POST'] : ['PATCH', 'DELETE'];
        if (!allowed.includes(method)) {
            return json({ error: 'Metoden støttes ikke.' }, 405, { Allow: allowed.join(', ') });
        }

        if (request.headers.get('sec-fetch-site') === 'cross-site') {
            return json({ error: 'Forespørselen ble avvist.' }, 403);
        }
        const existing = request.headers.get('cookie')?.match(cookiePattern)?.[1];
        if (!existing && method !== 'GET') {
            return json({ error: 'Last inn siden på nytt og tillat informasjonskapsler for å lagre.' }, 403);
        }

        const browserSession = existing ?? randomUUID();
        const browserId = createHash('sha256').update(browserSession).digest('hex');
        const owned = eq(inventoryItems.browserId, browserId);

        try {
            if (method === 'GET') {
                const items = await db.select(itemFields).from(inventoryItems).where(owned).orderBy(inventoryItems.id);
                return json(items, 200, {
                    'Set-Cookie': `${cookieName}=${browserSession}; Path=/; Max-Age=34560000; HttpOnly; Secure; SameSite=Strict`,
                });
            }

            const target = collection ? undefined : and(owned, eq(inventoryItems.id, id));
            if (method === 'DELETE') {
                const [removed] = await db.delete(inventoryItems).where(target).returning({ id: inventoryItems.id });
                return removed ? json(removed) : json({ error: 'Fant ikke gjenstanden.' }, 404);
            }

            const input = await readItem(request);
            if (!input) return json({ error: 'Skriv inn et navn og et helt antall mellom 1 og 999 999.' }, 400);
            const { name, quantity, category } = input;

            if (method === 'POST') {
                if (!inventoryCategory.enumValues.includes(category)) {
                    return json({ error: 'Velg en gyldig kategori.' }, 400);
                }
                const [item] = await db.insert(inventoryItems).values({ browserId, name, quantity, category }).returning(itemFields);
                return json(item, 201);
            }

            const [item] = await db.update(inventoryItems).set({ name, quantity }).where(target).returning(itemFields);
            return item ? json(item) : json({ error: 'Fant ikke gjenstanden.' }, 404);
        } catch {
            return json({ error: 'Inneholdslisten er midlertidig utilgjengelig. Prøv igjen.' }, 503);
        }
    };
}

export default createInventoryHandler(drizzle());
