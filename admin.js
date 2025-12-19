// Глобальные переменные
let allClients = [];
let currentEditingUser = null;
let currentCallsPage = 1;
let currentMessagesPage = 1;
const callsPerPage = 10;
const messagesPerPage = 10;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация админ-панели...');
    
    // Убедимся, что только dashboard активен
    document.querySelectorAll('.content-section').forEach(section => {
        if (section.id !== 'dashboard-section') {
            section.classList.remove('active');
        }
    });
    
    loadDashboardData();
    setInterval(loadDashboardData, 30000); // Автообновление каждые 30 секунд
    
    // Установка дат по умолчанию для фильтров
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('callsStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('callsEndDate').value = today.toISOString().split('T')[0];
    document.getElementById('messagesStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('messagesEndDate').value = today.toISOString().split('T')[0];
    
    // Установка текущего месяца для изменения трафика
    const currentMonth = today.toISOString().slice(0, 7);
    document.getElementById('trafficMonth').value = currentMonth;
    
    // Счетчик символов для сообщения
    document.getElementById('messageText').addEventListener('input', function() {
        const count = this.value.length;
        document.getElementById('messageCharCount').textContent = count;
    });
    
    // Обработка ввода изменения трафика
    document.getElementById('trafficClientPhone').addEventListener('input', function() {
        if (this.value.length >= 10) {
            loadClientTrafficInfo(this.value);
        }
    });
    
    document.getElementById('trafficChange').addEventListener('input', function() {
        calculateTrafficChange();
    });
    
    // Инициализация модального окна редактирования
    const editUserModal = document.getElementById('editUserModal');
    if (editUserModal) {
        editUserModal.addEventListener('shown.bs.modal', function() {
            const modalBody = this.querySelector('.modal-body');
            if (modalBody) {
                modalBody.scrollTop = 0;
            }
        });
    }
    
    console.log('Админ-панель инициализирована');
});

// Показать/скрыть секции
function showSection(sectionName) {
    console.log('Переключение на секцию:', sectionName);
    
    // Скрыть все секции
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Убрать активный класс со всех ссылок меню
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Показать выбранную секцию
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
        console.log('Секция активирована:', targetSection.id);
        
        // Добавить активный класс к текущей ссылке
        event.target.classList.add('active');
        
        // Загрузить данные для секции
        if (sectionName === 'reports') {
            loadDebtorsReport();
        } else if (sectionName === 'calls') {
            loadCallsHistory();
        } else if (sectionName === 'messages') {
            loadMessagesHistory();
        } else if (sectionName === 'dashboard') {
            loadDashboardData();
        }
    } else {
        console.error('Секция не найдена:', sectionName + '-section');
    }
}

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
        const response = await fetch('/api/admin/clients');
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            allClients = result.clients || [];
            
            const totalClients = allClients.length;
            const activeClients = allClients.filter(c => {
                const balance = parseFloat(c.balance) || 0;
                return balance >= 0 && c.status === 'active';
            }).length;
            const debtors = allClients.filter(c => {
                const debt = parseFloat(c.debt) || 0;
                return debt > 0;
            });
            const totalDebt = debtors.reduce((sum, d) => {
                const debt = parseFloat(d.debt) || 0;
                return sum + debt;
            }, 0);
            
            document.getElementById('totalClients').textContent = totalClients;
            document.getElementById('activeClients').textContent = activeClients;
            document.getElementById('debtorsCount').textContent = debtors.length;
            document.getElementById('totalDebt').textContent = totalDebt.toFixed(2) + ' BYN';
        } else {
            showNotification(result.error || 'Ошибка загрузки данных', 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        showNotification('Ошибка загрузки статистики: ' + error.message, 'error');
    }
}

// Загрузка последних клиентов
async function loadRecentClients() {
    try {
        const response = await fetch('/api/admin/clients');
        const result = await response.json();
        
        if (result.success) {
            const recentClients = result.clients.slice(0, 5);
            const tbody = document.getElementById('recentClientsTable');
            
            tbody.innerHTML = recentClients.map(client => {
                const balanceValue = parseFloat(client.balance) || 0;
                const debtValue = parseFloat(client.debt) || 0;
                const tariffName = client.tariff?.name || 'Не указан';
                
                return `
                    <tr class="clickable-row" onclick="editUser('${client._id}')">
                        <td>${client.fio}</td>
                        <td>${client.phone}</td>
                        <td class="${balanceValue < 0 ? 'text-danger' : 'text-success'} fw-bold">
                            ${balanceValue.toFixed(2)} BYN
                        </td>
                        <td>${tariffName}</td>
                        <td>
                            <span class="badge ${client.status === 'active' ? 'bg-success' : client.status === 'blocked' ? 'bg-danger' : 'bg-warning'}">
                                ${client.status === 'active' ? 'Активный' : client.status === 'blocked' ? 'Заблокирован' : 'Приостановлен'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteClient('${client._id}', '${client.fio}')">
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
    await loadAllClientsTable();
    const modal = new bootstrap.Modal(document.getElementById('allClientsModal'));
    modal.show();
}

// Загрузка всех клиентов в таблицу
async function loadAllClientsTable(search = '', statusFilter = '', tariffFilter = '') {
    try {
        if (allClients.length === 0) {
            const response = await fetch('/api/admin/clients');
            const result = await response.json();
            
            if (result.success) {
                allClients = result.clients;
            } else {
                showNotification('Ошибка загрузки данных', 'error');
                return;
            }
        }
        
        let filteredClients = allClients;
        
        if (search) {
            const searchLower = search.toLowerCase();
            filteredClients = filteredClients.filter(client => 
                client.fio.toLowerCase().includes(searchLower) || 
                client.phone.includes(search)
            );
        }
        
        if (statusFilter === 'debtor') {
            filteredClients = filteredClients.filter(client => {
                const debt = parseFloat(client.debt) || 0;
                return debt > 0;
            });
        } else if (statusFilter === 'active') {
            filteredClients = filteredClients.filter(client => {
                const balance = parseFloat(client.balance) || 0;
                return balance >= 0 && client.status === 'active';
            });
        } else if (statusFilter === 'blocked') {
            filteredClients = filteredClients.filter(client => client.status === 'blocked');
        }
        
        if (tariffFilter) {
            filteredClients = filteredClients.filter(client => client.tariff?.id === tariffFilter);
        }
        
        const tbody = document.getElementById('allClientsTable');
        tbody.innerHTML = filteredClients.map(client => {
            const tariffName = client.tariff?.name || 'Не указан';
            const tariffPrice = client.tariff?.price ? `${client.tariff.price} BYN` : '0 BYN';
            const includedMinutes = client.tariff?.includedMinutes || 0;
            const internetGB = client.tariff?.internetGB || 0;
            
            const balanceValue = parseFloat(client.balance) || 0;
            const debtValue = parseFloat(client.debt) || 0;
            const balanceClass = balanceValue < 0 ? 'text-danger' : 'text-success';
            
            return `
                <tr class="clickable-row" onclick="editUser('${client._id}')">
                    <td>${client.fio}</td>
                    <td>${client.phone}</td>
                    <td class="${balanceClass} fw-bold">${balanceValue.toFixed(2)} BYN</td>
                    <td class="text-danger fw-bold">${debtValue.toFixed(2)} BYN</td>
                    <td>
                        <strong>${tariffName}</strong><br>
                        <small class="text-muted">
                            ${tariffPrice} | ${includedMinutes} мин | ${internetGB} ГБ
                        </small>
                    </td>
                    <td>
                        <span class="badge ${client.status === 'active' ? 'bg-success' : client.status === 'blocked' ? 'bg-danger' : 'bg-warning'}">
                            ${client.status === 'active' ? 'Активный' : client.status === 'blocked' ? 'Заблокирован' : 'Приостановлен'}
                        </span>
                    </td>
                    <td>${client.formattedDate || 'Не указана'}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteClient('${client._id}', '${client.fio}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки клиентов:', error);
        showNotification('Ошибка загрузки данных клиентов', 'error');
    }
}

// Редактирование пользователя
async function editUser(userId) {
    try {
        showNotification('Загрузка данных пользователя...', 'info');
        
        if (!allClients || allClients.length === 0) {
            await loadDashboardData();
        }
        
        const user = allClients.find(c => c._id === userId);
        if (!user) {
            showNotification('Пользователь не найден', 'error');
            return;
        }

        currentEditingUser = user;

        // Обновляем заголовок модального окна
        document.getElementById('modalUserPhoneTitle').textContent = user.phone;

        // Заполняем основную информацию
        document.getElementById('modalUserFio').textContent = user.fio;
        document.getElementById('modalUserPhone').textContent = user.phone;
        
        // Форматируем дату регистрации для отображения
        let formattedDate = 'Нет данных';
        try {
            if (user.createdAt) {
                const date = new Date(user.createdAt);
                if (!isNaN(date.getTime())) {
                    formattedDate = date.toLocaleString('ru-RU');
                }
            }
        } catch (error) {
            console.warn('Ошибка форматирования даты:', error);
        }
        document.getElementById('modalUserRegDate').textContent = formattedDate;
        
        // Статус с цветовым оформлением
        const statusText = user.status === 'active' ? 'Активный' : 
                          user.status === 'blocked' ? 'Заблокирован' : 
                          user.status === 'suspended' ? 'Приостановлен' : 
                          user.status === 'inactive' ? 'Неактивный' : 'Неизвестно';
        
        const statusElement = document.getElementById('modalUserStatus');
        statusElement.textContent = statusText;
        statusElement.className = '';
        statusElement.classList.add(
            user.status === 'active' ? 'text-success' : 
            user.status === 'blocked' ? 'text-danger' : 
            user.status === 'suspended' ? 'text-warning' : 
            'text-muted'
        );
        
        // Извлекаем числовые значения
        const balanceValue = parseFloat(user.balance) || 0;
        const debtValue = parseFloat(user.debt) || 0;
        const creditLimit = parseFloat(user.creditLimit) || 50;
        
        // Финансовая информация
        const balanceElement = document.getElementById('modalUserBalance');
        balanceElement.innerHTML = 
            `<span class="${balanceValue >= 0 ? 'text-success' : 'text-danger'} fw-bold">
                ${balanceValue.toFixed(2)} BYN
            </span>`;
        
        const debtElement = document.getElementById('modalUserDebt');
        debtElement.innerHTML = 
            `<span class="text-danger fw-bold">
                ${debtValue.toFixed(2)} BYN
            </span>`;
        
        const creditElement = document.getElementById('modalUserCreditLimit');
        creditElement.innerHTML = 
            `<span class="text-info fw-bold">
                ${creditLimit.toFixed(2)} BYN
            </span>`;
        
        const availableCredit = Math.max(0, creditLimit + balanceValue);
        const availableElement = document.getElementById('modalUserAvailableCredit');
        availableElement.innerHTML = 
            `<span class="${availableCredit > 0 ? 'text-success' : 'text-warning'} fw-bold">
                ${availableCredit.toFixed(2)} BYN
            </span>`;

        // Заполняем информацию о тарифе
        const tariffElement = document.getElementById('modalUserTariff');
        if (user.tariff) {
            tariffElement.innerHTML = `
                <h5>${user.tariff.name}</h5>
                <div class="small">
                    <div><i class="fas fa-money-bill me-1"></i> Цена: ${user.tariff.price || 19.99} BYN/мес</div>
                    <div><i class="fas fa-phone me-1"></i> Минуты: ${user.tariff.includedMinutes || 300}</div>
                    <div><i class="fas fa-wifi me-1"></i> Интернет: ${user.tariff.internetGB || 15} ГБ</div>
                </div>
            `;
        } else {
            tariffElement.innerHTML = '<span class="text-warning">Тариф не указан</span>';
        }

        // Заполняем форму редактирования
        document.getElementById('editUserId').value = user._id;
        document.getElementById('editUserFio').value = user.fio;
        document.getElementById('editUserStatus').value = user.status || 'active';
        document.getElementById('editUserPhoneDisplay').value = user.phone;
        document.getElementById('editUserBalance').value = balanceValue;
        document.getElementById('editUserDebt').value = debtValue;
        document.getElementById('editUserCreditLimit').value = creditLimit;        
        
        // Тариф
        if (user.tariff?.id) {
            document.getElementById('editUserTariff').value = user.tariff.id;
        } else {
            document.getElementById('editUserTariff').value = 'standard';
        }
        
        // Данные тарифа
        document.getElementById('editUserTariffPrice').value = user.tariff?.price || 19.99;
        document.getElementById('editUserTariffMinutes').value = user.tariff?.includedMinutes || 300;
        document.getElementById('editUserTariffInternet').value = user.tariff?.internetGB || 15;
        document.getElementById('editUserTariffSMS').value = user.tariff?.includedSMS || 100;
        
        // Дата следующего списания
        const nextPayment = new Date();
        nextPayment.setDate(nextPayment.getDate() + 30);
        document.getElementById('editUserTariffNextPayment').value = 
            nextPayment.toISOString().split('T')[0];

        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();

        showNotification('Данные пользователя загружены', 'success');

    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        showNotification('Ошибка загрузки данных пользователя', 'error');
    }
}

// Сохранение изменений пользователя
async function saveUserChanges() {
    if (!currentEditingUser) {
        showNotification('Пользователь не выбран', 'error');
        return;
    }

    try {
        const userId = document.getElementById('editUserId').value;
        const userData = {
            fio: document.getElementById('editUserFio').value,
            phone: currentEditingUser.phone,
            status: document.getElementById('editUserStatus').value,
            creditLimit: parseFloat(document.getElementById('editUserCreditLimit').value) || 50,
            balance: parseFloat(document.getElementById('editUserBalance').value) || 0,
            debt: parseFloat(document.getElementById('editUserDebt').value) || 0
        };

        const response = await fetch(`/api/admin/clients/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('Изменения успешно сохранены!', 'success');
            loadDashboardData();
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            modal.hide();
        } else {
            showNotification(result.error, 'error');
        }

    } catch (error) {
        console.error('Ошибка сохранения изменений:', error);
        showNotification('Ошибка сохранения изменений', 'error');
    }
}

// Изменение статуса пользователя
async function changeUserStatus(status) {
    if (!currentEditingUser) return;
    
    const statusMap = {
        'active': 'активным',
        'blocked': 'заблокированным',
        'suspended': 'приостановленным'
    };
    
    if (confirm(`Вы уверены, что хотите сделать пользователя ${statusMap[status]}?`)) {
        try {
            const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`Статус пользователя изменен на "${statusMap[status]}"`);
                editUser(currentEditingUser._id);
                loadDashboardData();
            } else {
                showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('Ошибка изменения статуса:', error);
            showNotification('Ошибка изменения статуса', 'error');
        }
    }
}

// Быстрое пополнение баланса
function quickAddBalance(amount) {
    document.getElementById('addBalanceAmount').value = amount;
}

// Сброс пароля пользователя
async function resetUserPassword() {
    if (!currentEditingUser) return;
    
    const newPassword = prompt('Введите новый пароль для пользователя:');
    if (!newPassword) return;
    
    try {
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Пароль успешно изменен');
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка сброса пароля:', error);
        showNotification('Ошибка сброса пароля', 'error');
    }
}

// Экспорт данных пользователя
async function exportUserReport() {
    if (!currentEditingUser) return;
    
    try {
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/export`);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_${currentEditingUser.phone}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showNotification('Отчет экспортирован');
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        showNotification('Ошибка экспорта данных', 'error');
    }
}

// Сохранение изменений использования
async function saveUsageChanges() {
    if (!currentEditingUser) return;
    
    try {
        const usageData = {
            minutesLeft: parseInt(document.getElementById('editUserMinutesLeft').value) || 0,
            internetLeft: parseFloat(document.getElementById('editUserInternetLeft').value) || 0,
            smsLeft: parseInt(document.getElementById('editUserSMSLeft').value) || 0
        };
        
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/usage`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(usageData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Изменения использования сохранены');
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения использования:', error);
        showNotification('Ошибка сохранения изменений использования', 'error');
    }
}

// Обновление полей тарифа при выборе
function updateTariffFields() {
    const tariffId = document.getElementById('editUserTariff').value;
    let price = 19.99;
    let minutes = 300;
    let internet = 15;
    let sms = 100;
    
    if (tariffId === 'plus+') {
        price = 29.99;
        minutes = 500;
        internet = 25;
        sms = 200;
    } else if (tariffId === 'Super plus') {
        price = 35.99;
        minutes = 1000;
        internet = 50;
        sms = 500;
    } else if (tariffId === 'premium') {
        price = 49.99;
        minutes = 2000;
        internet = 100;
        sms = 1000;
    }
    
    document.getElementById('editUserTariffPrice').value = price;
    document.getElementById('editUserTariffMinutes').value = minutes;
    document.getElementById('editUserTariffInternet').value = internet;
    document.getElementById('editUserTariffSMS').value = sms;
}

// Показать вкладку пользователя
function showUserTab(tabName) {
    // Скрыть все вкладки
    document.querySelectorAll('.modal-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показать выбранную вкладку
    document.getElementById('user' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'Tab').classList.add('active');
    
    // Обновить активную кнопку
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
}

// Удаление текущего пользователя
async function deleteCurrentUser() {
    if (!currentEditingUser) return;

    if (!confirm(`Вы уверены, что хотите удалить пользователя "${currentEditingUser.fio}"? Это действие нельзя отменить.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(`Пользователь ${currentEditingUser.fio} удален`);
            loadDashboardData();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            modal.hide();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification('Ошибка удаления пользователя', 'error');
    }
}

// Удаление клиента
async function deleteClient(userId, userName) {
    if (!confirm(`Вы уверены, что хотите удалить пользователя "${userName}"? Это действие нельзя отменить.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/clients/${userId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(`Пользователь ${userName} удален`);
            loadDashboardData();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification('Ошибка удаления пользователя', 'error');
    }
}

// Пополнение баланса пользователя
async function addBalanceToUser() {
    if (!currentEditingUser) {
        showNotification('Пользователь не выбран', 'error');
        return;
    }

    const amountInput = document.getElementById('addBalanceAmount');
    const amount = parseFloat(amountInput.value);
    
    if (!amount || amount <= 0 || isNaN(amount)) {
        showNotification('Введите корректную сумму (больше 0)', 'error');
        amountInput.focus();
        return;
    }

    try {
        showNotification('Пополнение баланса...', 'info');
        
        const response = await fetch('/api/payment/topup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: currentEditingUser.phone,
                amount: amount
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(`Баланс пополнен на ${amount.toFixed(2)} BYN`, 'success');
            amountInput.value = '';
            
            await editUser(currentEditingUser._id);
            loadDashboardData();
        } else {
            showNotification(result.error || 'Ошибка пополнения баланса', 'error');
        }
    } catch (error) {
        console.error('Ошибка пополнения баланса:', error);
        showNotification('Ошибка пополнения баланса: ' + error.message, 'error');
    }
}

// Списание средств с пользователя
async function withdrawBalanceFromUser() {
    if (!currentEditingUser) return;

    const amount = document.getElementById('withdrawBalanceAmount').value;
    if (!amount || amount <= 0) {
        showNotification('Введите корректную сумму', 'error');
        return;
    }

    try {
        const response = await fetch('/api/payment/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: currentEditingUser.phone,
                amount: parseFloat(amount)
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(`Списано ${amount} BYN`);
            document.getElementById('withdrawBalanceAmount').value = '';
            editUser(currentEditingUser._id);
            loadDashboardData();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка списания средств:', error);
        showNotification('Ошибка списания средств', 'error');
    }
}

// Показать историю пользователя
function showUserHistory() {
    if (!currentEditingUser) return;
    showNotification('Функция истории действий в разработке', 'info');
}

// Применить изменения тарифа
function applyTariffChange() {
    showNotification('Изменения тарифа будут сохранены при нажатии "Сохранить изменения"', 'info');
}

// Принудительное обновление тарифа
function forceTariffUpdate() {
    showNotification('Функция принудительного обновления тарифа в разработке', 'info');
}

// Показать модальное окно добавления клиента
function showAddClientModal() {
    const modal = new bootstrap.Modal(document.getElementById('addClientModal'));
    modal.show();
}

// Добавление клиента
async function addClient() {
    try {
        const fio = document.getElementById('clientFio').value;
        const phone = document.getElementById('clientPhone').value;
        const password = document.getElementById('clientPassword').value;
        const balance = parseFloat(document.getElementById('clientBalance').value) || 0;
        const tariff = document.getElementById('clientTariff').value;

        if (!fio || !phone || !password) {
            showNotification('Заполните обязательные поля', 'error');
            return;
        }

        if (!/^\+375[0-9]{9}$/.test(phone)) {
            showNotification('Некорректный номер телефона. Формат: +375XXXXXXXXX', 'error');
            return;
        }

        let tariffData = {
            id: tariff,
            name: tariff === 'standard' ? 'Стандарт' : 
                  tariff === 'plus+' ? 'Плюс+' : 'Супер плюс',
            price: tariff === 'standard' ? 19.99 : 
                   tariff === 'plus+' ? 29.99 : 35.99,
            includedMinutes: tariff === 'standard' ? 300 : 
                            tariff === 'plus+' ? 500 : 1000,
            internetGB: tariff === 'standard' ? 15 : 
                       tariff === 'plus+' ? 25 : 50
        };

        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fio,
                phone,
                password,
                balance,
                tariff: tariffData,
                status: 'active',
                creditLimit: 50,
                debt: 0
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('Клиент успешно добавлен');
            bootstrap.Modal.getInstance(document.getElementById('addClientModal')).hide();
            document.getElementById('addClientForm').reset();
            loadDashboardData();
        } else {
            showNotification(result.message || result.error || 'Ошибка добавления клиента', 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления клиента:', error);
        showNotification('Ошибка добавления клиента: ' + error.message, 'error');
    }
}

// Показать модальное окно регистрации звонка
function showCallModal() {
    const modal = new bootstrap.Modal(document.getElementById('callModal'));
    modal.show();
}

// Регистрация звонка
async function registerCall() {
    try {
        const phone = document.getElementById('callClientPhone').value;
        const number = document.getElementById('callNumber').value;
        const callType = document.getElementById('callType').value;
        const duration = parseInt(document.getElementById('callDuration').value);

        if (!phone || !number || !duration || !callType) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        const response = await fetch('/api/calls/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone,
                number,
                duration,
                callType
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('Звонок успешно зарегистрирован');
            bootstrap.Modal.getInstance(document.getElementById('callModal')).hide();
            document.getElementById('callForm').reset();
            loadCallsHistory();
        } else {
            showNotification(result.error || 'Ошибка регистрации звонка', 'error');
        }
    } catch (error) {
        console.error('Ошибка регистрации звонка:', error);
        showNotification('Ошибка регистрации звонка', 'error');
    }
}

// Показать модальное окно отправки сообщения
function showMessageModal() {
    const modal = new bootstrap.Modal(document.getElementById('messageModal'));
    modal.show();
}

// Отправка сообщения
async function sendMessage() {
    try {
        const phone = document.getElementById('messageClientPhone').value;
        const recipient = document.getElementById('messageRecipient').value;
        const messageText = document.getElementById('messageText').value;
        const direction = document.getElementById('messageDirection').value;

        if (!phone || !recipient || !messageText || !direction) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        const response = await fetch('/api/usage/sms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone,
                recipientNumber: recipient,
                messageLength: messageText.length,
                direction
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('Сообщение успешно отправлено');
            bootstrap.Modal.getInstance(document.getElementById('messageModal')).hide();
            document.getElementById('messageForm').reset();
            document.getElementById('messageCharCount').textContent = '0';
            loadMessagesHistory();
        } else {
            showNotification(result.error || 'Ошибка отправки сообщения', 'error');
        }
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Показать модальное окно пополнения баланса
function showAddPaymentModal() {
    const modal = new bootstrap.Modal(document.getElementById('addPaymentModal'));
    modal.show();
}

// Обработка платежа
async function processPayment() {
    try {
        const phone = document.getElementById('paymentClientPhone').value;
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const method = document.getElementById('paymentMethod').value;

        if (!phone || !amount || amount <= 0) {
            showNotification('Заполните все поля корректно', 'error');
            return;
        }

        const response = await fetch('/api/payment/topup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone,
                amount,
                method
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(`Баланс пополнен на ${amount} BYN`);
            bootstrap.Modal.getInstance(document.getElementById('addPaymentModal')).hide();
            document.getElementById('addPaymentForm').reset();
            loadDashboardData();
        } else {
            showNotification(result.error || 'Ошибка пополнения баланса', 'error');
        }
    } catch (error) {
        console.error('Ошибка пополнения баланса:', error);
        showNotification('Ошибка пополнения баланса', 'error');
    }
}

// Показать модальное окно изменения трафика
function showTrafficEditModal() {
    const modal = new bootstrap.Modal(document.getElementById('trafficEditModal'));
    modal.show();
    
    // Сбросить форму
    document.getElementById('trafficEditForm').reset();
    document.getElementById('trafficClientInfo').textContent = '';
    document.getElementById('currentTraffic').textContent = '-';
    document.getElementById('tariffLimit').textContent = '-';
    document.getElementById('remainingTraffic').textContent = '-';
    document.getElementById('overLimitCost').textContent = '-';
    document.getElementById('trafficWarning').classList.add('d-none');
    
    // Установить текущий месяц
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    document.getElementById('trafficMonth').value = currentMonth;
}

// Загрузка информации о трафике клиента
async function loadClientTrafficInfo(phone) {
    try {
        // Загружаем данные пользователя
        const userResponse = await fetch(`/api/user/data?phone=${encodeURIComponent(phone)}`);
        const userResult = await userResponse.json();
        
        if (!userResult.success) {
            document.getElementById('trafficClientInfo').innerHTML = 
                `<span class="text-danger">Клиент не найден</span>`;
            return;
        }

        // Загружаем данные использования
        const usageResponse = await fetch(`/api/user/usage?phone=${encodeURIComponent(phone)}`);
        const usageResult = await usageResponse.json();
        
        if (!usageResult.success) {
            document.getElementById('trafficClientInfo').innerHTML = 
                `<span class="text-danger">Ошибка загрузки данных трафика</span>`;
            return;
        }

        const user = userResult;
        const usage = usageResult;
        
        // Отображаем информацию о клиенте
        document.getElementById('trafficClientInfo').innerHTML = 
            `<strong>${user.fio}</strong>, тариф: ${user.tariff.name}`;
        
        // Рассчитываем значения в МБ
        const currentGB = usage.internet.used;
        const currentMB = currentGB * 1024;
        const limitGB = usage.internet.total;
        const limitMB = limitGB * 1024;
        const remainingGB = Math.max(0, limitGB - currentGB);
        const remainingMB = remainingGB * 1024;
        const overCost = usage.internet.overCost;
        
        // Отображаем информацию о трафике
        document.getElementById('currentTraffic').innerHTML = 
            `<strong>${currentGB.toFixed(2)} ГБ</strong> (${currentMB.toFixed(0)} МБ)`;
        document.getElementById('tariffLimit').innerHTML = 
            `<strong>${limitGB} ГБ</strong> (${limitMB.toFixed(0)} МБ)`;
        document.getElementById('remainingTraffic').innerHTML = 
            `<strong>${remainingGB.toFixed(2)} ГБ</strong> (${remainingMB.toFixed(0)} МБ)`;
        document.getElementById('overLimitCost').innerHTML = 
            `<strong>${overCost.toFixed(2)} BYN/МБ</strong> за превышение`;
        
        // Сохраняем данные для расчетов
        document.getElementById('trafficEditForm').dataset.currentMB = currentMB;
        document.getElementById('trafficEditForm').dataset.limitMB = limitMB;
        document.getElementById('trafficEditForm').dataset.overCost = user.tariff.internetPricePerMB || 0.01;

    } catch (error) {
        console.error('Ошибка загрузки информации о трафике:', error);
        document.getElementById('trafficClientInfo').innerHTML = 
            `<span class="text-danger">Ошибка загрузки данных</span>`;
    }
}

// Расчет изменения трафика
function calculateTrafficChange() {
    const changeInput = document.getElementById('trafficChange').value.trim();
    const form = document.getElementById('trafficEditForm');
    
    if (!changeInput) {
        document.getElementById('trafficWarning').classList.add('d-none');
        return;
    }
    
    // Проверяем формат ввода
    if (!/^[+-]?\d+(\.\d+)?$/.test(changeInput)) {
        document.getElementById('trafficWarning').classList.remove('d-none');
        document.getElementById('warningText').textContent = 
            'Неверный формат. Используйте числа со знаком "+" или "-" (например: +500 или -300)';
        return;
    }
    
    const changeValue = parseFloat(changeInput);
    const currentMB = parseFloat(form.dataset.currentMB) || 0;
    const limitMB = parseFloat(form.dataset.limitMB) || 0;
    const overCost = parseFloat(form.dataset.overCost) || 0.01;
    
    if (isNaN(currentMB) || isNaN(limitMB)) {
        document.getElementById('trafficWarning').classList.remove('d-none');
        document.getElementById('warningText').textContent = 
            'Сначала введите номер телефона клиента';
        return;
    }
    
    // Рассчитываем новый трафик
    const newMB = currentMB + changeValue;
    
    if (newMB < 0) {
        document.getElementById('trafficWarning').classList.remove('d-none');
        document.getElementById('warningText').textContent = 
            `Невозможно уменьшить трафик ниже 0. Текущий трафик: ${currentMB.toFixed(0)} МБ`;
        return;
    }
    
    // Проверяем превышение лимита
    const overMB = Math.max(0, newMB - limitMB);
    const cost = overMB * overCost;
    
    if (overMB > 0) {
        document.getElementById('trafficWarning').classList.remove('d-none');
        document.getElementById('warningText').textContent = 
            `Внимание! После изменения трафик превысит лимит на ${overMB.toFixed(0)} МБ. ` +
            `Будет начислена дополнительная плата: ${cost.toFixed(2)} BYN`;
    } else {
        document.getElementById('trafficWarning').classList.add('d-none');
    }
}

// Применение изменения трафика
async function applyTrafficChange() {
    try {
        const phone = document.getElementById('trafficClientPhone').value;
        const trafficChange = document.getElementById('trafficChange').value.trim();
        const month = document.getElementById('trafficMonth').value;
        
        if (!phone || !trafficChange) {
            showNotification('Заполните все обязательные поля', 'error');
            return;
        }
        
        // Проверяем формат ввода
        if (!/^[+-]?\d+(\.\d+)?$/.test(trafficChange)) {
            showNotification('Неверный формат изменения трафика. Используйте числа со знаком "+" или "-"', 'error');
            return;
        }
        
        showNotification('Применение изменений...', 'warning');
        
        const response = await fetch('/api/admin/traffic/edit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone,
                trafficChange,
                month: month || undefined
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message);
            
            // Сбросить форму
            document.getElementById('trafficEditForm').reset();
            document.getElementById('trafficClientInfo').textContent = '';
            document.getElementById('currentTraffic').textContent = '-';
            document.getElementById('tariffLimit').textContent = '-';
            document.getElementById('remainingTraffic').textContent = '-';
            document.getElementById('overLimitCost').textContent = '-';
            document.getElementById('trafficWarning').classList.add('d-none');
            
            // Закрыть модальное окно
            const modal = bootstrap.Modal.getInstance(document.getElementById('trafficEditModal'));
            modal.hide();
            
            // Обновить данные дашборда
            loadDashboardData();
            
        } else {
            showNotification(result.error, 'error');
        }
        
    } catch (error) {
        console.error('Ошибка изменения трафика:', error);
        showNotification('Ошибка изменения трафика', 'error');
    }
}

// Загрузка истории звонков
async function loadCallsHistory(page = 1) {
    try {
        currentCallsPage = page;
        const phone = document.getElementById('callsPhoneFilter').value;
        const callType = document.getElementById('callsTypeFilter').value;
        const startDate = document.getElementById('callsStartDate').value;
        const endDate = document.getElementById('callsEndDate').value;

        let url = `/api/admin/calls?page=${page}&limit=${callsPerPage}`;
        
        if (phone) url += `&phone=${encodeURIComponent(phone)}`;
        if (callType) url += `&callType=${callType}`;
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;

        const response = await fetch(url);
        const result = await response.json();

        if (result.success) {
            // Обновляем статистику
            document.getElementById('totalCalls').textContent = result.totalCalls;
            document.getElementById('localCalls').textContent = result.localCalls;
            document.getElementById('internationalCalls').textContent = result.internationalCalls;
            document.getElementById('totalCallsCost').textContent = result.totalCost.toFixed(2) + ' BYN';

            // Заполняем таблицу
            const tbody = document.getElementById('callsHistoryTable');
            tbody.innerHTML = result.calls.map(call => `
                <tr>
                    <td>${call.date}</td>
                    <td>${call.userFio}</td>
                    <td>${call.phone}</td>
                    <td>${call.number}</td>
                    <td>
                        <span class="badge ${call.callType === 'local' ? 'bg-primary' : 'bg-warning'}">
                            ${call.callType === 'local' ? 'Местный' : 'Международный'}
                        </span>
                    </td>
                    <td>${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}</td>
                    <td class="fw-bold">${call.cost.toFixed(2)} BYN</td>
                </tr>
            `).join('');

            // Обновляем пагинацию
            updateCallsPagination(result.totalPages, page);
            document.getElementById('callsPaginationInfo').textContent = 
                `Показано ${result.calls.length} из ${result.totalCalls} записей`;
        }
    } catch (error) {
        console.error('Ошибка загрузки истории звонков:', error);
        showNotification('Ошибка загрузки истории звонков', 'error');
    }
}

// Обновление пагинации для истории звонков
function updateCallsPagination(totalPages, currentPage) {
    const pagination = document.getElementById('callsPagination');
    pagination.innerHTML = '';

    // Кнопка "Назад"
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" onclick="loadCallsHistory(${currentPage - 1})">Назад</a>`;
    pagination.appendChild(prevLi);

    // Номера страниц
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="loadCallsHistory(${i})">${i}</a>`;
        pagination.appendChild(li);
    }

    // Кнопка "Вперед"
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" onclick="loadCallsHistory(${currentPage + 1})">Вперед</a>`;
    pagination.appendChild(nextLi);
}

// Очистка фильтров истории звонков
function clearCallsFilters() {
    document.getElementById('callsPhoneFilter').value = '';
    document.getElementById('callsTypeFilter').value = '';
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('callsStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('callsEndDate').value = today.toISOString().split('T')[0];
    
    loadCallsHistory(1);
}

// Загрузка истории сообщений
async function loadMessagesHistory(page = 1) {
    try {
        currentMessagesPage = page;
        const phone = document.getElementById('messagesPhoneFilter').value;
        const direction = document.getElementById('messagesDirectionFilter').value;
        const startDate = document.getElementById('messagesStartDate').value;
        const endDate = document.getElementById('messagesEndDate').value;

        let url = `/api/admin/sms?page=${page}&limit=${messagesPerPage}`;
        
        if (phone) url += `&phone=${encodeURIComponent(phone)}`;
        if (direction) url += `&direction=${direction}`;
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;

        const response = await fetch(url);
        const result = await response.json();

        if (result.success) {
            // Обновляем статистику
            document.getElementById('totalMessages').textContent = result.total;
            document.getElementById('outgoingMessages').textContent = result.stats.outgoing || 0;
            document.getElementById('incomingMessages').textContent = result.stats.incoming || 0;
            document.getElementById('totalMessagesCost').textContent = result.stats.totalCost.toFixed(2) + ' BYN';

            // Заполняем таблицу
            const tbody = document.getElementById('messagesHistoryTable');
            tbody.innerHTML = result.data.map(sms => `
                <tr>
                    <td>${sms.date}</td>
                    <td>${sms.userFio}</td>
                    <td>${sms.phone}</td>
                    <td>${sms.recipient}</td>
                    <td>
                        <span class="badge ${sms.direction === 'Исходящее' ? 'bg-primary' : 'bg-success'}">
                            ${sms.direction}
                        </span>
                    </td>
                    <td>${sms.length}</td>
                    <td class="fw-bold">${sms.cost.toFixed(2)} BYN</td>
                </tr>
            `).join('');

            // Обновляем пагинацию
            updateMessagesPagination(result.totalPages, page);
            document.getElementById('messagesPaginationInfo').textContent = 
                `Показано ${result.data.length} из ${result.total} записей`;
        }
    } catch (error) {
        console.error('Ошибка загрузки истории сообщений:', error);
        showNotification('Ошибка загрузки истории сообщений', 'error');
    }
}

// Обновление пагинации для истории сообщений
function updateMessagesPagination(totalPages, currentPage) {
    const pagination = document.getElementById('messagesPagination');
    pagination.innerHTML = '';

    // Кнопка "Назад"
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" onclick="loadMessagesHistory(${currentPage - 1})">Назад</a>`;
    pagination.appendChild(prevLi);

    // Номера страниц
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="loadMessagesHistory(${i})">${i}</a>`;
        pagination.appendChild(li);
    }

    // Кнопка "Вперед"
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" onclick="loadMessagesHistory(${currentPage + 1})">Вперед</a>`;
    pagination.appendChild(nextLi);
}

// Очистка фильтров истории сообщений
function clearMessagesFilters() {
    document.getElementById('messagesPhoneFilter').value = '';
    document.getElementById('messagesDirectionFilter').value = '';
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('messagesStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('messagesEndDate').value = today.toISOString().split('T')[0];
    
    loadMessagesHistory(1);
}

// Экспорт отчетов
async function exportUsersReport() {
    try {
        showNotification('Формирование отчета...', 'warning');
        
        const response = await fetch('/api/reports/users/word');
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        
        const blob = await response.blob();
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `users_report_${new Date().toISOString().split('T')[0]}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('Отчет по пользователям успешно сформирован');
    } catch (error) {
        console.error('Ошибка экспорта отчета:', error);
        showNotification('Ошибка формирования отчета', 'error');
    }
}

async function exportCallsReport() {
    try {
        showNotification('Формирование отчета...', 'warning');
        
        const response = await fetch('/api/reports/calls/word');
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        
        const blob = await response.blob();
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `calls_report_${new Date().toISOString().split('T')[0]}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('Отчет по звонкам успешно сформирован');
    } catch (error) {
        console.error('Ошибка экспорта отчета:', error);
        showNotification('Ошибка формирования отчета', 'error');
    }
}

async function exportDebtorsReport() {
    try {
        showNotification('Формирование отчета...', 'warning');
        
        const response = await fetch('/api/reports/debtors/word');
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        
        const blob = await response.blob();
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `debtors_report_${new Date().toISOString().split('T')[0]}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('Отчет по должникам успешно сформирован');
    } catch (error) {
        console.error('Ошибка экспорта отчета:', error);
        showNotification('Ошибка формирования отчета', 'error');
    }
}

// Загрузка отчета по должникам
async function loadDebtorsReport() {
    try {
        const response = await fetch('/api/reports/debtors');
        const result = await response.json();
        
        if (result.success) {
            const container = document.getElementById('debtorsReport');
            container.innerHTML = `
                <div class="report-card">
                    <div class="report-header">
                        <div class="report-title">Отчет по должникам</div>
                        <div class="report-value">${result.totalDebtors} клиентов</div>
                    </div>
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Общая задолженность:</strong> ${result.totalDebt}</p>
                        </div>
                    </div>
                    <div class="table-responsive mt-3">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>ФИО</th>
                                    <th>Телефон</th>
                                    <th>Баланс</th>
                                    <th>Долг</th>
                                    <th>Тариф</th>
                                    <th>Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${result.debtors.map(debtor => `
                                    <tr>
                                        <td>${debtor.fio}</td>
                                        <td>${debtor.phone}</td>
                                        <td class="text-danger">${debtor.balance}</td>
                                        <td class="text-danger fw-bold">${debtor.debt}</td>
                                        <td>${debtor.tariff}</td>
                                        <td>${debtor.status}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Ошибка загрузки отчета по должникам:', error);
    }
}

// Уведомления
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        window.location.href = '/';
    }
}

// Обработчики событий для фильтров
document.getElementById('searchAllClients').addEventListener('input', function(e) {
    const search = e.target.value;
    const statusFilter = document.getElementById('statusFilter').value;
    const tariffFilter = document.getElementById('tariffFilter').value;
    loadAllClientsTable(search, statusFilter, tariffFilter);
});

document.getElementById('statusFilter').addEventListener('change', function(e) {
    const search = document.getElementById('searchAllClients').value;
    const statusFilter = e.target.value;
    const tariffFilter = document.getElementById('tariffFilter').value;
    loadAllClientsTable(search, statusFilter, tariffFilter);
});

document.getElementById('tariffFilter').addEventListener('change', function(e) {
    const search = document.getElementById('searchAllClients').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const tariffFilter = e.target.value;
    loadAllClientsTable(search, statusFilter, tariffFilter);
});

// Показать вкладку пользователя
function showUserTab(tabName) {
    // Скрыть все вкладки
    document.querySelectorAll('.modal-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Скрыть все кнопки вкладок
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показать выбранную вкладку
    document.getElementById('user' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'Tab').classList.add('active');
    
    // Активировать кнопку вкладки
    event.target.classList.add('active');
    
    // Если выбрана вкладка услуг, загружаем список услуг
    if (tabName === 'services') {
        loadUserServices();
    }
    
    // Если выбрана вкладка использования, загружаем статистику
    if (tabName === 'usage') {
        loadUserUsageStats();
    }
}

// Загрузка подключенных услуг пользователя
async function loadUserServices() {
    if (!currentEditingUser) return;
    
    try {
        // Здесь должен быть API запрос для получения услуг пользователя
        // Пока используем заглушку
        const userServices = currentEditingUser.services || [];
        
        const servicesList = document.getElementById('userServicesList');
        if (userServices.length === 0) {
            servicesList.innerHTML = '<p class="text-muted text-center py-3">У пользователя нет подключенных услуг</p>';
        } else {
            servicesList.innerHTML = userServices.map(service => `
                <div class="col-md-6">
                    <div class="alert alert-info mb-0">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="service_${service.id}" 
                                   value="${service.id}" checked disabled>
                            <label class="form-check-label" for="service_${service.id}">
                                <strong>${service.name}</strong><br>
                                <small class="text-muted">${service.description}</small><br>
                                <small class="text-success">${service.price} BYN/мес</small>
                            </label>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Отмечаем галочки для доступных услуг
        document.querySelectorAll('#availableServices input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = userServices.some(service => service.id === checkbox.value);
        });
        
    } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
    }
}

// Загрузка статистики использования
async function loadUserUsageStats() {
    if (!currentEditingUser) return;
    
    try {
        // Здесь должен быть API запрос для получения статистики использования
        // Пока используем заглушку
        const usageData = {
            minutesUsed: 45,
            internetUsed: 5.2, // ГБ
            smsUsed: 12
        };
        
        const tariffMinutes = currentEditingUser.tariff?.includedMinutes || 300;
        const tariffInternet = currentEditingUser.tariff?.internetGB || 15;
        const tariffSMS = currentEditingUser.tariff?.includedSMS || 100;
        
        document.getElementById('usageMinutes').textContent = 
            `${usageData.minutesUsed} из ${tariffMinutes}`;
        document.getElementById('usageInternet').textContent = 
            `${usageData.internetUsed.toFixed(1)} ГБ из ${tariffInternet} ГБ`;
        document.getElementById('usageSMS').textContent = 
            `${usageData.smsUsed} из ${tariffSMS}`;
        
    } catch (error) {
        console.error('Ошибка загрузки статистики использования:', error);
    }
}

// Применить изменения услуг
async function applyServicesChanges() {
    if (!currentEditingUser) {
        showNotification('Пользователь не выбран', 'error');
        return;
    }
    
    try {
        // Собираем выбранные услуги
        const selectedServices = [];
        document.querySelectorAll('#availableServices input[type="checkbox"]:checked').forEach(checkbox => {
            selectedServices.push(checkbox.value);
        });
        
        showNotification('Обновление услуг...', 'warning');
        
        // Здесь должен быть API запрос для обновления услуг
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/services`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ services: selectedServices })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Услуги успешно обновлены', 'success');
            loadUserServices(); // Обновляем список
        } else {
            showNotification(result.error || 'Ошибка обновления услуг', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка обновления услуг:', error);
        showNotification('Ошибка обновления услуг', 'error');
    }
}

// Переключение видимости пароля
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = event.target.closest('button');
    
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        button.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// Быстрое пополнение баланса
function quickAddBalance(amount) {
    document.getElementById('addBalanceAmount').value = amount;
}

// Пополнение баланса пользователя
async function addBalanceToUser() {
    if (!currentEditingUser) {
        showNotification('Пользователь не выбран', 'error');
        return;
    }
    
    const amountInput = document.getElementById('addBalanceAmount');
    const amount = parseFloat(amountInput.value);
    
    if (!amount || amount <= 0 || isNaN(amount)) {
        showNotification('Введите корректную сумму (больше 0)', 'error');
        amountInput.focus();
        return;
    }
    
    try {
        showNotification('Пополнение баланса...', 'warning');
        
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                operation: 'add'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Баланс пополнен на ${amount.toFixed(2)} BYN`, 'success');
            amountInput.value = '';
            
            // Обновляем отображение баланса
            const balanceElement = document.getElementById('modalUserBalance');
            const currentBalance = parseFloat(balanceElement.textContent.replace(' BYN', '')) || 0;
            const newBalance = currentBalance + amount;
            balanceElement.innerHTML = `<span class="${newBalance >= 0 ? 'text-success' : 'text-danger'} fw-bold">${newBalance.toFixed(2)} BYN</span>`;
            
        } else {
            showNotification(result.error || 'Ошибка пополнения баланса', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка пополнения баланса:', error);
        showNotification('Ошибка пополнения баланса', 'error');
    }
}

// Списание средств с пользователя
async function withdrawBalanceFromUser() {
    if (!currentEditingUser) {
        showNotification('Пользователь не выбран', 'error');
        return;
    }
    
    const amountInput = document.getElementById('withdrawBalanceAmount');
    const amount = parseFloat(amountInput.value);
    
    if (!amount || amount <= 0 || isNaN(amount)) {
        showNotification('Введите корректную сумму (больше 0)', 'error');
        amountInput.focus();
        return;
    }
    
    try {
        showNotification('Списание средств...', 'warning');
        
        const response = await fetch(`/api/admin/clients/${currentEditingUser._id}/balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                operation: 'withdraw'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Списано ${amount.toFixed(2)} BYN`, 'success');
            amountInput.value = '';
            
            // Обновляем отображение баланса
            const balanceElement = document.getElementById('modalUserBalance');
            const currentBalance = parseFloat(balanceElement.textContent.replace(' BYN', '')) || 0;
            const newBalance = currentBalance - amount;
            balanceElement.innerHTML = `<span class="${newBalance >= 0 ? 'text-success' : 'text-danger'} fw-bold">${newBalance.toFixed(2)} BYN</span>`;
            
        } else {
            showNotification(result.error || 'Ошибка списания средств', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка списания средств:', error);
        showNotification('Ошибка списания средств', 'error');
    }
}

// Сохранение изменений пользователя (упрощенное)
async function saveUserChanges() {
    if (!currentEditingUser) {
        showNotification('Пользователь не выбран', 'error');
        return;
    }
    
    try {
        const userId = document.getElementById('editUserId').value;
        const userData = {
            fio: document.getElementById('editUserFio').value,
            status: document.getElementById('editUserStatus').value,
            tariff: document.getElementById('editUserTariff').value
        };
        
        // Добавляем пароль, если он указан
        const newPassword = document.getElementById('editUserPassword').value;
        if (newPassword) {
            userData.password = newPassword;
        }
        
        showNotification('Сохранение изменений...', 'warning');
        
        const response = await fetch(`/api/admin/clients/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Изменения успешно сохранены', 'success');
            
            // Обновляем данные в интерфейсе
            currentEditingUser.fio = userData.fio;
            currentEditingUser.status = userData.status;
            currentEditingUser.tariff = userData.tariff;
            
            loadDashboardData(); // Обновляем дашборд
            
            // Закрываем модальное окно
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            modal.hide();
            
        } else {
            showNotification(result.error || 'Ошибка сохранения изменений', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка сохранения изменений:', error);
        showNotification('Ошибка сохранения изменений', 'error');
    }
}

// Обновленная функция editUser для загрузки данных в новое модальное окно
async function editUser(userId) {
    try {
        // ... существующий код загрузки данных пользователя ...
        
        // После загрузки данных пользователя обновляем модальное окно:
        
        // Заполняем информацию о тарифе
        const tariffInfo = document.getElementById('currentTariffInfo');
        if (user.tariff) {
            tariffInfo.innerHTML = `
                <h5>${user.tariff.name || 'Стандарт'}</h5>
                <div class="row">
                    <div class="col-md-6">
                        <small class="text-muted">Цена:</small>
                        <div>${user.tariff.price || 19.99} BYN/мес</div>
                    </div>
                    <div class="col-md-6">
                        <small class="text-muted">Включено минут:</small>
                        <div>${user.tariff.includedMinutes || 300}</div>
                    </div>
                    <div class="col-md-6">
                        <small class="text-muted">Включено интернета:</small>
                        <div>${user.tariff.internetGB || 15} ГБ</div>
                    </div>
                    <div class="col-md-6">
                        <small class="text-muted">Включено SMS:</small>
                        <div>${user.tariff.includedSMS || 100}</div>
                    </div>
                </div>
            `;
        } else {
            tariffInfo.innerHTML = '<p class="text-muted">Тариф не указан</p>';
        }
        
        // Устанавливаем выбранный тариф
        if (user.tariff?.id) {
            document.getElementById('editUserTariff').value = user.tariff.id;
        }
        
        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();
        
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        showNotification('Ошибка загрузки данных пользователя', 'error');
    }
}