// Глобальные переменные
let allClients = [];
let currentEditingUser = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация админ-панели...');
    loadDashboardData();
    setInterval(loadDashboardData, 30000);
});

// Загрузка данных дашборда
async function loadDashboardData() {
    try {
        await loadStatistics();
        await loadRecentClients();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

// Загрузка статистики
async function loadStatistics() {
    try {
        const response = await fetch('/api/admin/statistics');
        const result = await response.json();
        
        if (result.success) {
            const stats = result.statistics;
            document.getElementById('totalClients').textContent = stats.totalClients || 0;
            document.getElementById('activeClients').textContent = stats.activeClients || 0;
            document.getElementById('debtorsCount').textContent = stats.debtors || 0;
            document.getElementById('totalDebt').textContent = (stats.totalDebt || 0) + ' BYN';
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Загрузка последних клиентов
async function loadRecentClients() {
    try {
        const response = await fetch('/api/admin/clients?limit=5');
        const result = await response.json();
        
        if (result.success) {
            allClients = result.clients || [];
            const tbody = document.getElementById('recentClientsTable');
            
            if (allClients.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-muted py-4">
                            <i class="fas fa-users fa-2x mb-2"></i>
                            <p>Нет данных о клиентах</p>
                        </td>
                    </tr>
                `;
                return;
            }
            
            tbody.innerHTML = allClients.map(client => {
                const balanceValue = parseFloat(client.balance) || 0;
                const tariffName = client.tariff?.name || 'Не указан';
                
                return `
                    <tr class="clickable-row" onclick="editUser('${client._id}')">
                        <td>${client.fio || 'Не указано'}</td>
                        <td>${client.phone || 'Не указано'}</td>
                        <td class="${balanceValue < 0 ? 'text-danger' : 'text-success'} fw-bold">
                            ${balanceValue.toFixed(2)} BYN
                        </td>
                        <td>${tariffName}</td>
                        <td>
                            <span class="badge ${client.status === 'active' ? 'bg-success' : 
                                client.status === 'blocked' ? 'bg-danger' : 'bg-warning'}">
                                ${client.status === 'active' ? 'Активный' : 
                                 client.status === 'blocked' ? 'Заблокирован' : 
                                 client.status || 'Неизвестно'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-danger" 
                                    onclick="event.stopPropagation(); deleteClient('${client._id}', '${client.fio}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки клиентов:', error);
    }
}

// Показать всех клиентов
async function showAllClientsModal() {
    try {
        // Загружаем данные
        const response = await fetch('/api/admin/clients?limit=1000');
        const result = await response.json();
        
        if (result.success) {
            const clients = result.clients;
            let modalContent = `
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Все клиенты (${clients.length})</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>ФИО</th>
                                            <th>Телефон</th>
                                            <th>Баланс</th>
                                            <th>Тариф</th>
                                            <th>Статус</th>
                                            <th>Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
            
            clients.forEach(client => {
                const balanceValue = parseFloat(client.balance) || 0;
                const tariffName = client.tariff?.name || 'Не указан';
                
                modalContent += `
                    <tr>
                        <td>${client.fio}</td>
                        <td>${client.phone}</td>
                        <td class="${balanceValue < 0 ? 'text-danger' : 'text-success'} fw-bold">
                            ${balanceValue.toFixed(2)} BYN
                        </td>
                        <td>${tariffName}</td>
                        <td>
                            <span class="badge ${client.status === 'active' ? 'bg-success' : 
                                              client.status === 'blocked' ? 'bg-danger' : 
                                              'bg-warning'}">
                                ${client.status === 'active' ? 'Активный' : 
                                 client.status === 'blocked' ? 'Заблокирован' : 
                                 client.status || 'Неизвестно'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="editUser('${client._id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            modalContent += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>`;
            
            // Показываем модальное окно
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = modalContent;
            document.body.appendChild(modal);
            
            const bootstrapModal = new bootstrap.Modal(modal);
            bootstrapModal.show();
            
            // Удаляем модальное окно после закрытия
            modal.addEventListener('hidden.bs.modal', function () {
                document.body.removeChild(modal);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки всех клиентов:', error);
        showNotification('Ошибка загрузки клиентов', 'error');
    }
}

// Редактирование пользователя
async function editUser(userId) {
    try {
        const response = await fetch(`/api/admin/clients/${userId}`);
        const result = await response.json();
        
        if (result.success) {
            currentEditingUser = result.client;
            showEditUserModal();
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        showNotification('Ошибка загрузки данных пользователя', 'error');
    }
}

// Показать модальное окно редактирования
function showEditUserModal() {
    if (!currentEditingUser) return;
    
    const modalContent = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Редактирование клиента</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">ФИО</label>
                        <input type="text" class="form-control" id="editFio" value="${currentEditingUser.fio}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Телефон</label>
                        <input type="text" class="form-control" value="${currentEditingUser.phone}" disabled>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Баланс</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="editBalance" value="${currentEditingUser.balance}">
                            <span class="input-group-text">BYN</span>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Статус</label>
                        <select class="form-select" id="editStatus">
                            <option value="active" ${currentEditingUser.status === 'active' ? 'selected' : ''}>Активный</option>
                            <option value="blocked" ${currentEditingUser.status === 'blocked' ? 'selected' : ''}>Заблокирован</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Тариф</label>
                        <select class="form-select" id="editTariff">
                            <option value="standard" ${currentEditingUser.tariff?.id === 'standard' ? 'selected' : ''}>Стандарт</option>
                            <option value="plus+" ${currentEditingUser.tariff?.id === 'plus+' ? 'selected' : ''}>Плюс+</option>
                            <option value="Super plus" ${currentEditingUser.tariff?.id === 'Super plus' ? 'selected' : ''}>Супер плюс</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                    <button type="button" class="btn btn-primary" onclick="saveUserChanges()">Сохранить</button>
                </div>
            </div>
        </div>`;
    
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
}

// Сохранение изменений пользователя
async function saveUserChanges() {
    try {
        const updatedData = {
            fio: document.getElementById('editFio').value,
            status: document.getElementById('editStatus').value,
            tariff: document.getElementById('editTariff').value
        };
        
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Данные сохранены', 'success');
            loadDashboardData();
            
            // Закрываем модальное окно
            const modal = bootstrap.Modal.getInstance(document.querySelector('.modal.show'));
            modal.hide();
        } else {
            showNotification(result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка сохранения', 'error');
    }
}

// Удаление клиента
async function deleteClient(userId, userName) {
    if (!confirm(`Удалить клиента "${userName}"?`)) return;
    
    try {
        const response = await fetch(`/api/admin/clients/${userId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Клиент удален', 'success');
            loadDashboardData();
        } else {
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showNotification('Ошибка удаления', 'error');
    }
}

// Показать модальное окно добавления клиента
function showAddClientModal() {
    const modalContent = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Добавить клиента</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">ФИО *</label>
                        <input type="text" class="form-control" id="newFio" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Телефон *</label>
                        <input type="text" class="form-control" id="newPhone" placeholder="+375XXXXXXXXX" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Пароль *</label>
                        <input type="password" class="form-control" id="newPassword" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Начальный баланс</label>
                        <input type="number" class="form-control" id="newBalance" value="0">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Тариф</label>
                        <select class="form-select" id="newTariff">
                            <option value="standard">Стандарт</option>
                            <option value="plus+">Плюс+</option>
                            <option value="Super plus">Супер плюс</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                    <button type="button" class="btn btn-primary" onclick="addNewClient()">Добавить</button>
                </div>
            </div>
        </div>`;
    
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
}

// Добавление нового клиента
async function addNewClient() {
    try {
        const newClient = {
            fio: document.getElementById('newFio').value,
            phone: document.getElementById('newPhone').value,
            password: document.getElementById('newPassword').value,
            balance: document.getElementById('newBalance').value,
            tariff: document.getElementById('newTariff').value
        };
        
        const response = await fetch('/api/admin/clients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newClient)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Клиент добавлен', 'success');
            loadDashboardData();
            
            // Закрываем модальное окно
            const modal = bootstrap.Modal.getInstance(document.querySelector('.modal.show'));
            modal.hide();
        } else {
            showNotification(result.error || 'Ошибка добавления', 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления:', error);
        showNotification('Ошибка добавления', 'error');
    }
}

// Уведомления
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999;';
    
    setTimeout(() => {
        notification.className = 'alert alert-dismissible fade';
    }, 3000);
}

// Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        window.location.href = '/';
    }
}