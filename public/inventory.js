(() => {
    const endpoint = '/api/inventory';
    const categories = [
        { key: 'kjokken', title: 'Kjøkken', icon: 'utensils', example: 'Middagstallerkener' },
        { key: 'sengetoy', title: 'Sengetøy', icon: 'bed-double', example: 'Dynetrekk' },
        { key: 'handklar', title: 'Håndklær', icon: 'bath', example: 'Badehåndklær' },
        { key: 'puter-utemobler', title: 'Puter utemøbler', icon: 'armchair', example: 'Sitteputer' },
        { key: 'kluter', title: 'Kluter', icon: 'square-dashed', example: 'Kjøkkenkluter' },
    ];
    const page = document.getElementById('tab-inneholdsliste');
    const categoryList = page.querySelector('[data-inventory-categories]');
    const cardTemplate = page.querySelector('[data-inventory-category]');
    const rowTemplate = page.querySelector('[data-inventory-item]');
    const feedback = page.querySelector('[data-inventory-feedback]');
    const status = page.querySelector('[data-inventory-status]');
    const retry = page.querySelector('[data-inventory-retry]');
    const numberFormat = new Intl.NumberFormat('nb-NO');
    let loading = false;
    let loaded = false;

    async function requestInventory({ method = 'GET', id, item } = {}) {
        let response;
        try {
            response = await fetch(id ? `${endpoint}/${id}` : endpoint, {
                method,
                ...(item && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }),
            });
        } catch {
            throw new Error('Ingen forbindelse. Prøv igjen.');
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) {
            throw new Error(payload?.error || 'Inneholdslisten er midlertidig utilgjengelig. Prøv igjen.');
        }
        return payload;
    }

    function buildCategory({ key, title, icon, example }) {
        const card = cardTemplate.content.firstElementChild.cloneNode(true);
        const titleElement = card.querySelector('h3');
        const fieldset = card.querySelector('fieldset');
        const form = card.querySelector('form');
        const nameInput = form.elements.namedItem('name');
        const quantityInput = form.elements.namedItem('quantity');
        const submit = form.querySelector('[type="submit"]');
        const cancel = form.querySelector('[data-inventory-cancel]');
        const message = card.querySelector('[data-inventory-message]');
        const empty = card.querySelector('[data-inventory-empty]');
        const list = card.querySelector('[data-inventory-items]');
        const total = card.querySelector('[data-inventory-total]');
        const items = new Map();
        let editingId = null;

        titleElement.id = `inventory-${key}`;
        titleElement.textContent = title;
        card.setAttribute('aria-labelledby', titleElement.id);
        card.querySelector('legend').textContent = title;
        card.querySelector('i').setAttribute('data-lucide', icon);
        nameInput.placeholder = example;

        function showMessage(text, error = false) {
            message.classList.toggle('text-red-700', error);
            message.classList.toggle('text-cabin-forest', !error);
            message.textContent = text;
        }

        function setEditor(item = null) {
            editingId = item?.id ?? null;
            nameInput.value = item?.name ?? '';
            quantityInput.value = item?.quantity ?? 1;
            submit.textContent = item ? 'Lagre endringer' : 'Legg til';
            cancel.classList.toggle('hidden', !item);
        }

        function render() {
            let quantity = 0;
            const rows = document.createDocumentFragment();
            for (const item of items.values()) {
                const row = rowTemplate.content.firstElementChild.cloneNode(true);
                const edit = row.querySelector('[data-inventory-edit]');
                const remove = row.querySelector('[data-inventory-remove]');
                row.querySelector('[data-inventory-name]').textContent = item.name;
                row.querySelector('[data-inventory-quantity]').textContent = `${numberFormat.format(item.quantity)} stk.`;
                quantity += item.quantity;

                edit.setAttribute('aria-label', `Endre ${item.name}`);
                edit.addEventListener('click', () => {
                    setEditor(item);
                    showMessage('');
                    nameInput.focus();
                    nameInput.select();
                });

                remove.setAttribute('aria-label', `Slett ${item.name}`);
                remove.addEventListener('click', async () => {
                    if (!window.confirm(`Vil du slette «${item.name}»?`)) return;
                    fieldset.disabled = true;
                    showMessage('Sletter …');
                    try {
                        await requestInventory({ method: 'DELETE', id: item.id });
                        items.delete(item.id);
                        if (editingId === item.id) setEditor();
                        render();
                        showMessage('Gjenstanden ble slettet.');
                    } catch (error) {
                        showMessage(error.message, true);
                    } finally {
                        fieldset.disabled = false;
                        if (!page.classList.contains('hidden')) {
                            (remove.isConnected ? remove : nameInput).focus();
                        }
                    }
                });

                rows.append(row);
            }
            list.replaceChildren(rows);
            empty.classList.toggle('hidden', items.size > 0);
            total.textContent = `${numberFormat.format(quantity)} stk.`;
            total.classList.remove('hidden');
        }

        cancel.addEventListener('click', () => {
            setEditor();
            showMessage('');
            nameInput.focus();
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (fieldset.disabled) return;
            const name = nameInput.value.trim();
            if (!name) {
                showMessage('Skriv inn et navn på gjenstanden.', true);
                nameInput.focus();
                return;
            }
            const id = editingId;
            const quantity = quantityInput.valueAsNumber;
            fieldset.disabled = true;
            showMessage('Lagrer …');
            try {
                const item = await requestInventory({
                    method: id ? 'PATCH' : 'POST', id, item: { category: key, name, quantity },
                });
                items.set(item.id, item);
                setEditor();
                render();
                showMessage(id ? 'Endringene er lagret.' : 'Gjenstanden ble lagt til.');
            } catch (error) {
                showMessage(error.message, true);
            } finally {
                fieldset.disabled = false;
                if (!page.classList.contains('hidden')) nameInput.focus();
            }
        });

        categoryList.append(card);
        return (savedItems) => {
            for (const item of savedItems) {
                if (item.category === key) items.set(item.id, item);
            }
            render();
            fieldset.disabled = false;
        };
    }

    const populate = categories.map(buildCategory);

    async function loadInventory() {
        if (loaded || loading) return;
        loading = true;
        retry.classList.add('hidden');
        status.textContent = 'Laster inneholdslisten …';
        try {
            const items = await requestInventory();
            if (!Array.isArray(items)) throw new Error('Kunne ikke laste inneholdslisten.');
            populate.forEach((fillCategory) => fillCategory(items));
            loaded = true;
            feedback.classList.add('hidden');
        } catch (error) {
            status.textContent = error.message;
            retry.classList.remove('hidden');
        } finally {
            loading = false;
        }
    }

    page.addEventListener('inventory:open', loadInventory);
    retry.addEventListener('click', loadInventory);
})();
