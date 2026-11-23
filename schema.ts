import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const inventoryCategory = pgEnum('inventory_category', [
    'kjokken', 'sengetoy', 'handklar', 'puter-utemobler', 'kluter',
]);

export const inventoryItems = pgTable('inventory_items', {
    id: serial().primaryKey(),
    browserId: varchar('browser_id', { length: 64 }).notNull(),
    category: inventoryCategory().notNull(),
    name: varchar({ length: 120 }).notNull(),
    quantity: integer().notNull(),
}, (table) => [
    index('inventory_items_browser_id_idx').on(table.browserId, table.id),
    check('inventory_items_quantity_range', sql`${table.quantity} between 1 and 999999`),
]);
