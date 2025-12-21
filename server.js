const express = require('express');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// ========== IN-MEMORY БАЗА ДАННЫХ С СОХРАНЕНИЕМ ==========
const DATA_FILE = path.join(__dirname, 'data.json');

// Конфигурация тарифов
const TARIFFS = {
    'standard': { 
        id: 'standard', 
        name: 'Стандарт', 
        price: 19.99,
        includedMinutes: 300,
        internetGB: 15,
        smsCount: 100,
        minutePrice: 0.10,
        internetPricePerMB: 0.01,
        smsPrice: 0.05,
        internationalMinutePrice: 1.50
    },
    'plus+': { 
        id: 'plus+', 
        name: 'Плюс+', 
        price: 29.99,
        includedMinutes: 300,
        internetGB: 50,
        smsCount: 300,
        minutePrice: 0.15,
        internetPricePerMB: 0.008,
        smsPrice: 0.04,
        internationalMinutePrice: 2.0
    },
    'Super plus': { 
        id: 'Super plus', 
        name: 'Супер плюс', 
        price: 35.99,
        includedMinutes: 600,
        internetGB: 100,
        smsCount: 600,
        minutePrice: 0.20,
        internetPricePerMB: 0.005,
        smsPrice: 0.03,
        internationalMinutePrice: 1.50
    }
};

// Функции для работы с данными
function loadDatabase() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            return {
                users: parsed.users || [],
                calls: parsed.calls || [],
                internetUsage: parsed.internetUsage || [],
                smsUsage: parsed.smsUsage || [],
                payments: parsed.payments || [],
                userServices: parsed.userServices || [],
                nextUserId: parsed.nextUserId || 1,
                nextCallId: parsed.nextCallId || 1,
                nextPaymentId: parsed.nextPaymentId || 1,
                nextServiceId: parsed.nextServiceId || 1
            };
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
    
    return {
        users: [],
        calls: [],
        internetUsage: [],
        smsUsage: [],
        payments: [],
        userServices: [],
        nextUserId: 1,
        nextCallId: 1,
        nextPaymentId: 1,
        nextServiceId: 1
    };
}

function saveDatabase() {
    try {
        const data = JSON.stringify(database, null, 2);
        fs.writeFileSync(DATA_FILE, data, 'utf8');
        console.log('Данные сохранены');
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
    }
}

// Загружаем данные при запуске
let database = loadDatabase();

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function formatDate(date) {
    if (!date) return 'Не указано';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return 'Неверная дата';
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    } catch (error) {
        return 'Ошибка формата';
    }
}

function getStatusLabel(status) {
    switch(status) {
        case 'active': return 'Активный';
        case 'blocked': return 'Заблокирован';
        case 'suspended': return 'Приостановлен';
        default: return status || 'Неизвестно';
    }
}

// ========== КОНФИГУРАЦИЯ ШРИФТОВ ==========
const fontsPath = path.join(__dirname, 'fonts');

function checkFonts() {
    console.log('🔍 Проверка шрифтов...');
    
    const arialRegular = path.join(fontsPath, 'arial.ttf');
    const arialBold = path.join(fontsPath, 'arialbd.ttf');
    
    const missing = [];
    
    if (!fs.existsSync(arialRegular)) {
        missing.push('arial.ttf');
    }
    
    if (!fs.existsSync(arialBold)) {
        missing.push('arialbd.ttf');
    }
    
    if (missing.length > 0) {
        console.warn('⚠️  Отсутствуют файлы шрифтов:', missing);
        return false;
    }
    
    console.log('✅ Шрифты Arial найдены');
    return true;
}

// ========== ИНИЦИАЛИЗАЦИЯ ТЕСТОВЫХ ДАННЫХ ==========
async function initializeTestData() {
    console.log('📝 Инициализация данных...');
    
    try {
        if (database.users.length > 0) {
            console.log(`✅ Данные уже загружены: ${database.users.length} пользователей`);
            return true;
        }
        
        const hashedPassword = await bcrypt.hash('123123', 10);
        
        // Администратор
        database.users.push({
            _id: 'admin_001',
            fio: 'Администратор',
            phone: '+375256082909',
            password: hashedPassword,
            role: 'admin',
            balance: 1000,
            tariff: TARIFFS.standard,
            creditLimit: 100,
            status: 'active',
            debt: 0,
            createdAt: new Date()
        });

        // Тестовые клиенты
        const testUsers = [
            {
                fio: 'Иванов Иван Иванович',
                phone: '+375291234567',
                balance: 150.50,
                tariff: TARIFFS.standard,
                creditLimit: 50,
                status: 'active',
                debt: 0
            },
            {
                fio: 'Петров Петр Петрович',
                phone: '+375292345678',
                balance: -25.00,
                tariff: TARIFFS['plus+'],
                creditLimit: 50,
                status: 'active',
                debt: 25
            },
            {
                fio: 'Сидорова Анна Михайловна',
                phone: '+375293456789',
                balance: 75.00,
                tariff: TARIFFS['Super plus'],
                creditLimit: 50,
                status: 'active',
                debt: 0
            },
            {
                fio: 'Козлов Владимир Сергеевич',
                phone: '+375294567890',
                balance: 0.00,
                tariff: TARIFFS.standard,
                creditLimit: 50,
                status: 'blocked',
                debt: 50
            },
            {
                fio: 'Николаева Елена Петровна',
                phone: '+375295678901',
                balance: -15.00,
                tariff: TARIFFS['plus+'],
                creditLimit: 50,
                status: 'active',
                debt: 15
            }
        ];

        for (let i = 0; i < testUsers.length; i++) {
            const userData = testUsers[i];
            database.users.push({
                _id: `user_${(i + 1).toString().padStart(3, '0')}`,
                fio: userData.fio,
                phone: userData.phone,
                password: hashedPassword,
                role: 'client',
                balance: userData.balance,
                tariff: userData.tariff,
                creditLimit: userData.creditLimit,
                status: userData.status,
                debt: userData.debt,
                createdAt: new Date(Date.now() - (i * 7 * 24 * 60 * 60 * 1000))
            });
        }

        console.log(`✅ Создано пользователей: ${database.users.length}`);
        console.log(`   • Администраторов: ${database.users.filter(u => u.role === 'admin').length}`);
        console.log(`   • Клиентов: ${database.users.filter(u => u.role === 'client').length}`);
        
        saveDatabase();
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка инициализации данных:', error);
        return false;
    }
}

// ========== MIDDLEWARE ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware для логирования
app.use((req, res, next) => {
    console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${req.url}`);
    next();
});

// ========== РОУТЫ ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/client', (req, res) => {
    res.sendFile(path.join(__dirname, 'client.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ========== API ЭНДПОИНТЫ ==========

// Проверка здоровья
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        users: database.users.length
    });
});

// Получение статистики
app.get('/api/admin/statistics', (req, res) => {
    try {
        const clients = database.users.filter(u => u.role === 'client');
        
        const statistics = {
            totalClients: clients.length,
            activeClients: clients.filter(c => c.balance >= 0 && c.status === 'active').length,
            debtors: clients.filter(c => c.debt > 0).length,
            totalDebt: clients.reduce((sum, c) => sum + (c.debt || 0), 0).toFixed(2)
        };
        
        res.json({
            success: true,
            statistics
        });
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения статистики' 
        });
    }
});

// Получение всех клиентов
app.get('/api/admin/clients', (req, res) => {
    try {
        const { 
            search = '', 
            status = '', 
            tariff = '',
            page = 1, 
            limit = 50 
        } = req.query;
        
        let clients = database.users.filter(u => u.role === 'client');
        
        if (search) {
            const searchLower = search.toLowerCase();
            clients = clients.filter(client => 
                client.fio.toLowerCase().includes(searchLower) || 
                client.phone.includes(search)
            );
        }
        
        if (status === 'debtor') {
            clients = clients.filter(client => client.debt > 0);
        } else if (status === 'active') {
            clients = clients.filter(client => client.balance >= 0 && client.status === 'active');
        } else if (status === 'blocked') {
            clients = clients.filter(client => client.status === 'blocked');
        }
        
        if (tariff) {
            clients = clients.filter(client => client.tariff?.id === tariff);
        }
        
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedClients = clients.slice(startIndex, endIndex);
        
        const formattedClients = paginatedClients.map(client => ({
            _id: client._id,
            fio: client.fio,
            phone: client.phone,
            balance: client.balance,
            debt: client.debt,
            status: client.status,
            tariff: client.tariff,
            creditLimit: client.creditLimit,
            createdAt: client.createdAt,
            formattedDate: formatDate(client.createdAt)
        }));
        
        res.json({
            success: true,
            clients: formattedClients,
            total: clients.length,
            page: pageNum,
            totalPages: Math.ceil(clients.length / limitNum)
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения клиентов:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения клиентов' 
        });
    }
});

// Получение одного клиента по ID
app.get('/api/admin/clients/:id', (req, res) => {
    try {
        const client = database.users.find(u => u._id === req.params.id && u.role === 'client');
        
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Клиент не найден'
            });
        }
        
        res.json({
            success: true,
            client: {
                _id: client._id,
                fio: client.fio,
                phone: client.phone,
                balance: client.balance,
                debt: client.debt,
                status: client.status,
                tariff: client.tariff,
                creditLimit: client.creditLimit,
                createdAt: client.createdAt
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения клиента:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения клиента' 
        });
    }
});

// Обновление клиента
app.put('/api/admin/clients/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const index = database.users.findIndex(u => u._id === userId && u.role === 'client');
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Клиент не найден'
            });
        }
        
        const { fio, status, tariff } = req.body;
        
        if (fio) database.users[index].fio = fio;
        if (status) database.users[index].status = status;
        if (tariff) database.users[index].tariff = TARIFFS[tariff] || TARIFFS.standard;
        
        if (req.body.password) {
            database.users[index].password = await bcrypt.hash(req.body.password, 10);
        }
        
        res.json({
            success: true,
            message: 'Данные клиента обновлены',
            client: database.users[index]
        });
    } catch (error) {
        console.error('❌ Ошибка обновления клиента:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка обновления клиента' 
        });
    }
});

// Удаление клиента
app.delete('/api/admin/clients/:id', (req, res) => {
    try {
        const userId = req.params.id;
        const index = database.users.findIndex(u => u._id === userId && u.role === 'client');
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Клиент не найден'
            });
        }
        
        const deletedUser = database.users.splice(index, 1)[0];
        
        res.json({
            success: true,
            message: `Клиент ${deletedUser.fio} удален`,
            deletedUserId: userId
        });
    } catch (error) {
        console.error('❌ Ошибка удаления клиента:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка удаления клиента' 
        });
    }
});

// Добавление нового клиента
app.post('/api/admin/clients', async (req, res) => {
    try {
        const { fio, phone, password, balance = 0, tariff = 'standard' } = req.body;
        
        if (!fio || !phone || !password) {
            return res.status(400).json({
                success: false,
                error: 'Заполните все обязательные поля'
            });
        }
        
        if (database.users.some(u => u.phone === phone)) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь с таким телефоном уже существует'
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            _id: `user_${database.nextUserId.toString().padStart(3, '0')}`,
            fio,
            phone,
            password: hashedPassword,
            role: 'client',
            balance: parseFloat(balance) || 0,
            tariff: TARIFFS[tariff] || TARIFFS.standard,
            creditLimit: 50,
            status: 'active',
            debt: 0,
            createdAt: new Date()
        };
        
        database.users.push(newUser);
        database.nextUserId++;
        
        res.status(201).json({
            success: true,
            message: 'Клиент успешно добавлен',
            client: newUser
        });
    } catch (error) {
        console.error('❌ Ошибка добавления клиента:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка добавления клиента' 
        });
    }
});

// Авторизация
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.json({ 
                success: false, 
                message: 'Заполните все поля' 
            });
        }

        const user = database.users.find(u => u.phone === phone);
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'Пользователь не найден' 
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.json({ 
                success: false, 
                message: 'Неверный пароль' 
            });
        }

        const userData = {
            _id: user._id,
            fio: user.fio,
            phone: user.phone,
            role: user.role,
            balance: user.balance || 0,
            creditLimit: user.creditLimit || 50,
            status: user.status || 'active',
            tariff: user.tariff,
            debt: user.debt || 0,
            createdAt: user.createdAt
        };

        const redirectUrl = user.role === 'admin' ? '/admin' : '/client';
        
        res.json({ 
            success: true, 
            redirect: redirectUrl,
            user: userData
        });

    } catch (error) {
        console.error('❌ Ошибка авторизации:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка сервера' 
        });
    }
});

// ========== ОТЧЕТЫ PDF ==========

// Тестовый PDF отчет с РУССКИМ ТЕКСТОМ и шрифтом Arial
app.get('/api/reports/test/pdf', (req, res) => {
    try {
        console.log('📊 Генерация тестового PDF с русским текстом...');
        
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });
        
        // Регистрируем Arial шрифты
        const arialRegular = path.join(fontsPath, 'arial.ttf');
        const arialBold = path.join(fontsPath, 'arialbd.ttf');
        
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';
        
        if (fs.existsSync(arialRegular)) {
            console.log('✅ Регистрирую шрифт Arial');
            doc.registerFont('Arial', arialRegular);
            fontRegular = 'Arial';
        }
        
        if (fs.existsSync(arialBold)) {
            console.log('✅ Регистрирую шрифт Arial-Bold');
            doc.registerFont('Arial-Bold', arialBold);
            fontBold = 'Arial-Bold';
        }
        
        const fileName = `test_report_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        
        doc.pipe(res);
        
        // Заголовок
        doc.fontSize(24)
           .font(fontBold)
           .fillColor('#1976d2')
           .text('ТЕСТОВЫЙ ОТЧЕТ', { align: 'center' })
           .moveDown();
        
        // Информация
        doc.fontSize(14)
           .font(fontRegular)
           .fillColor('#333')
           .text('Мобильный оператор - Панель управления')
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        const clients = database.users.filter(u => u.role === 'client');
        
        doc.fontSize(16)
           .font(fontBold)
           .fillColor('#1976d2')
           .text('СТАТИСТИКА:', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(12)
           .font(fontRegular)
           .fillColor('#333')
           .text(`Всего клиентов: ${clients.length}`)
           .text(`Активных клиентов: ${clients.filter(c => c.balance >= 0 && c.status === 'active').length}`)
           .text(`Должников: ${clients.filter(c => c.debt > 0).length}`)
           .moveDown();
        
        // Список клиентов
        if (clients.length > 0) {
            doc.fontSize(16)
               .font(fontBold)
               .fillColor('#1976d2')
               .text('КЛИЕНТЫ:', { underline: true })
               .moveDown(0.5);
            
            // Простая таблица
            let y = doc.y;
            
            // Заголовки таблицы
            doc.fontSize(10)
               .font(fontBold)
               .fillColor('#fff')
               .rect(50, y, 500, 20)
               .fill('#1976d2');
            
            doc.fillColor('#fff')
               .text('ФИО', 55, y + 5)
               .text('Телефон', 200, y + 5)
               .text('Баланс', 350, y + 5);
            
            y += 25;
            
            // Данные
            doc.fontSize(9)
               .font(fontRegular)
               .fillColor('#333');
            
            clients.slice(0, 10).forEach((client, index) => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                
                // Чередующийся фон
                if (index % 2 === 0) {
                    doc.fillColor('#f8f9fa')
                       .rect(50, y - 5, 500, 20)
                       .fill();
                    doc.fillColor('#333');
                }
                
                const balanceColor = client.balance < 0 ? '#dc3545' : '#28a745';
                
                // РУССКИЙ ТЕКСТ - должен отображаться корректно
                doc.text(client.fio || 'Не указано', 55, y, { width: 140 })
                   .text(client.phone || '-', 200, y, { width: 140 })
                   .fillColor(balanceColor)
                   .text(`${client.balance.toFixed(2)} BYN`, 350, y, { width: 100 })
                   .fillColor('#333');
                
                y += 20;
            });
        } else {
            doc.fontSize(14)
               .font(fontRegular)
               .fillColor('#666')
               .text('Нет данных о клиентах', { align: 'center' });
        }
        
        // Тестовый текст
        doc.moveDown(2);
        doc.fontSize(10)
           .font(fontRegular)
           .fillColor('#666')
           .text('Тест кодировки: Русский текст должен отображаться корректно.', { align: 'center' });
        
        doc.end();
        
        console.log('✅ PDF успешно сгенерирован со шрифтом Arial');
        
    } catch (error) {
        console.error('❌ Ошибка генерации PDF:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка генерации PDF',
            message: error.message
        });
    }
});

// Отчет по пользователям с русскими шрифтами
app.get('/api/reports/users/pdf', (req, res) => {
    try {
        const { status } = req.query;
        
        console.log('📊 Генерация отчета по пользователям...');
        
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });
        
        // Регистрируем Arial шрифты
        const arialRegular = path.join(fontsPath, 'arial.ttf');
        const arialBold = path.join(fontsPath, 'arialbd.ttf');
        
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';
        
        if (fs.existsSync(arialRegular)) {
            doc.registerFont('Arial', arialRegular);
            fontRegular = 'Arial';
        }
        
        if (fs.existsSync(arialBold)) {
            doc.registerFont('Arial-Bold', arialBold);
            fontBold = 'Arial-Bold';
        }
        
        const fileName = `users_report_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        doc.pipe(res);
        
        // Заголовок
        doc.fontSize(20)
           .font(fontBold)
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ПОЛЬЗОВАТЕЛЯМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font(fontRegular)
           .fillColor('#333')
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`)
           .moveDown();
        
        // Фильтрация пользователей
        let users = database.users.filter(u => u.role === 'client');
        
        if (status === 'debtor') {
            users = users.filter(u => u.debt > 0);
        } else if (status === 'active') {
            users = users.filter(u => u.status === 'active' && u.balance >= 0);
        } else if (status === 'blocked') {
            users = users.filter(u => u.status === 'blocked');
        }
        
        // Статистика
        const stats = {
            total: users.length,
            totalBalance: users.reduce((sum, u) => sum + (u.balance || 0), 0),
            totalDebt: users.reduce((sum, u) => sum + (u.debt || 0), 0),
            active: users.filter(u => u.status === 'active').length,
            blocked: users.filter(u => u.status === 'blocked').length
        };
        
        doc.fontSize(14)
           .font(fontBold)
           .fillColor('#1976d2')
           .text('СТАТИСТИКА:', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(12)
           .font(fontRegular)
           .fillColor('#333')
           .text(`Всего пользователей: ${stats.total}`)
           .text(`Активных: ${stats.active}`)
           .text(`Заблокированных: ${stats.blocked}`)
           .text(`Общий баланс: ${stats.totalBalance.toFixed(2)} BYN`)
           .text(`Общая задолженность: ${stats.totalDebt.toFixed(2)} BYN`)
           .moveDown();
        
        if (users.length === 0) {
            doc.fontSize(16)
               .font(fontRegular)
               .fillColor('#666')
               .text('Нет данных для отчета', { align: 'center' });
        } else {
            // Таблица пользователей
            let y = doc.y;
            
            // Заголовки таблицы
            doc.fontSize(10)
               .font(fontBold)
               .fillColor('#fff')
               .rect(50, y, 500, 20)
               .fill('#1976d2');
            
            doc.fillColor('#fff')
               .text('ФИО', 55, y + 5)
               .text('Телефон', 200, y + 5)
               .text('Баланс', 320, y + 5)
               .text('Статус', 420, y + 5);
            
            y += 25;
            
            // Данные
            doc.fontSize(9)
               .font(fontRegular)
               .fillColor('#333');
            
            users.forEach((user, index) => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                
                if (index % 2 === 0) {
                    doc.fillColor('#f8f9fa')
                       .rect(50, y - 5, 500, 20)
                       .fill();
                    doc.fillColor('#333');
                }
                
                const balanceColor = user.balance < 0 ? '#dc3545' : '#28a745';
                
                doc.text(user.fio || '-', 55, y, { width: 140 })
                   .text(user.phone || '-', 200, y, { width: 120 })
                   .fillColor(balanceColor)
                   .text(`${user.balance.toFixed(2)} BYN`, 320, y, { width: 100 })
                   .fillColor('#333')
                   .text(getStatusLabel(user.status), 420, y, { width: 130 });
                
                y += 20;
            });
        }
        
        doc.end();
        
    } catch (error) {
        console.error('❌ Ошибка генерации отчета по пользователям:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка генерации отчета' 
        });
    }
});

// Отчет по должникам с русскими шрифтами
app.get('/api/reports/debtors/pdf', (req, res) => {
    try {
        console.log('📊 Генерация отчета по должникам...');
        
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });
        
        // Регистрируем Arial шрифты
        const arialRegular = path.join(fontsPath, 'arial.ttf');
        const arialBold = path.join(fontsPath, 'arialbd.ttf');
        
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';
        
        if (fs.existsSync(arialRegular)) {
            doc.registerFont('Arial', arialRegular);
            fontRegular = 'Arial';
        }
        
        if (fs.existsSync(arialBold)) {
            doc.registerFont('Arial-Bold', arialBold);
            fontBold = 'Arial-Bold';
        }
        
        const fileName = `debtors_report_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        doc.pipe(res);
        
        // Заголовок
        doc.fontSize(20)
           .font(fontBold)
           .fillColor('#dc3545')
           .text('ОТЧЕТ ПО ДОЛЖНИКАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font(fontRegular)
           .fillColor('#333')
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`)
           .moveDown();
        
        // Получаем должников
        const debtors = database.users.filter(u => 
            u.role === 'client' && u.debt > 0
        );
        
        // Статистика
        const totalDebt = debtors.reduce((sum, d) => sum + (d.debt || 0), 0);
        const avgDebt = debtors.length > 0 ? totalDebt / debtors.length : 0;
        
        doc.fontSize(14)
           .font(fontBold)
           .fillColor('#dc3545')
           .text('СТАТИСТИКА ЗАДОЛЖЕННОСТИ:', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(12)
           .font(fontRegular)
           .fillColor('#333')
           .text(`Всего должников: ${debtors.length}`)
           .text(`Общая сумма долга: ${totalDebt.toFixed(2)} BYN`)
           .text(`Средний долг: ${avgDebt.toFixed(2)} BYN`)
           .moveDown();
        
        if (debtors.length === 0) {
            doc.fontSize(16)
               .font(fontRegular)
               .fillColor('#28a745')
               .text('Должников не обнаружено!', { align: 'center' });
        } else {
            // Таблица должников
            let y = doc.y;
            
            // Заголовки
            doc.fontSize(10)
               .font(fontBold)
               .fillColor('#fff')
               .rect(50, y, 500, 20)
               .fill('#dc3545');
            
            doc.fillColor('#fff')
               .text('ФИО', 55, y + 5)
               .text('Телефон', 150, y + 5)
               .text('Долг', 280, y + 5)
               .text('Баланс', 380, y + 5);
            
            y += 25;
            
            // Данные
            doc.fontSize(9)
               .font(fontRegular)
               .fillColor('#333');
            
            debtors.forEach((debtor, index) => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                
                if (index % 2 === 0) {
                    doc.fillColor('#fdf2f2')
                       .rect(50, y - 5, 500, 20)
                       .fill();
                    doc.fillColor('#333');
                }
                
                doc.text(debtor.fio || '-', 55, y, { width: 90 })
                   .text(debtor.phone || '-', 150, y, { width: 130 })
                   .fillColor('#dc3545')
                   .text(`${debtor.debt.toFixed(2)} BYN`, 280, y, { width: 100 })
                   .fillColor(debtor.balance < 0 ? '#dc3545' : '#28a745')
                   .text(`${debtor.balance.toFixed(2)} BYN`, 380, y, { width: 120 })
                   .fillColor('#333');
                
                y += 20;
            });
        }
        
        doc.end();
        
    } catch (error) {
        console.error('❌ Ошибка генерации отчета по должникам:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка генерации отчета' 
        });
    }
});

// Простой отчет на английском (запасной вариант)
app.get('/api/reports/simple/users/pdf', (req, res) => {
    try {
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });
        
        const fileName = `users_report_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        doc.pipe(res);
        
        // Английские заголовки
        doc.fontSize(24)
           .text('USERS REPORT', { align: 'center' })
           .moveDown();
        
        doc.fontSize(14)
           .text('Mobile Operator - Admin Panel')
           .text(`Date: ${new Date().toISOString().split('T')[0]}`)
           .moveDown();
        
        // Статистика
        const clients = database.users.filter(u => u.role === 'client');
        
        doc.fontSize(16)
           .text('STATISTICS:', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(12)
           .text(`Total clients: ${clients.length}`)
           .text(`Active clients: ${clients.filter(c => c.status === 'active').length}`)
           .text(`Debtors: ${clients.filter(c => c.debt > 0).length}`)
           .moveDown();
        
        // Таблица
        if (clients.length > 0) {
            let y = doc.y;
            
            doc.fontSize(10)
               .text('#', 55, y + 5)
               .text('Name', 80, y + 5)
               .text('Phone', 250, y + 5)
               .text('Balance', 350, y + 5)
               .text('Status', 450, y + 5);
            
            y += 25;
            
            doc.fontSize(9);
            
            clients.forEach((client, index) => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                
                doc.text((index + 1).toString(), 55, y)
                   .text(client.fio || 'Not specified', 80, y, { width: 170 })
                   .text(client.phone || '-', 250, y, { width: 100 })
                   .text(`${client.balance.toFixed(2)} BYN`, 350, y, { width: 100 })
                   .text(client.status === 'active' ? 'Active' : 'Blocked', 450, y, { width: 100 });
                
                y += 20;
            });
        }
        
        doc.end();
        
    } catch (error) {
        console.error('❌ Ошибка генерации отчета:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка генерации отчета' 
        });
    }
});

// ========== КЛИЕНТСКАЯ ПАНЕЛЬ ==========

// Получение данных пользователя
app.get('/api/user/data', (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Не указан телефон'
            });
        }
        
        const user = database.users.find(u => u.phone === phone);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Получаем полные данные тарифа из конфигурации
        let tariffData;
        if (user.tariff && user.tariff.id) {
            // Если у пользователя есть ID тарифа, берем из конфигурации
            tariffData = TARIFFS[user.tariff.id] || TARIFFS.standard;
        } else if (typeof user.tariff === 'string') {
            // Если тариф хранится как строка
            tariffData = TARIFFS[user.tariff] || TARIFFS.standard;
        } else {
            // Если тариф уже объект, но без полных данных
            tariffData = user.tariff || TARIFFS.standard;
        }
        
        // Формируем полные данные тарифа
        const fullTariffData = {
            id: tariffData.id || 'standard',
            name: tariffData.name || 'Стандарт',
            price: tariffData.price || 19.99,
            includedMinutes: tariffData.includedMinutes || 300,
            internetGB: tariffData.internetGB || 15,
            smsCount: tariffData.smsCount || 100,
            minutePrice: tariffData.minutePrice || 0.10,
            internetPricePerMB: tariffData.internetPricePerMB || 0.01,
            smsPrice: tariffData.smsPrice || 0.05,
            internationalMinutePrice: tariffData.internationalMinutePrice || 1.50,
            features: getTariffFeatures(tariffData)
        };
        
        // Формируем данные пользователя
        const userData = {
            success: true,
            fio: user.fio || 'Не указано',
            phone: user.phone,
            balance: user.balance || 0,
            debt: user.debt || 0,
            status: user.status || 'active',
            creditLimit: user.creditLimit || 50,
            tariff: fullTariffData, // Полные данные тарифа
            createdAt: user.createdAt || new Date(),
            role: user.role || 'client'
        };
        
        console.log('📊 Отправляемые данные пользователя:', {
            fio: userData.fio,
            tariff: userData.tariff.name,
            balance: userData.balance
        });
        
        res.json(userData);
        
    } catch (error) {
        console.error('❌ Ошибка получения данных пользователя:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения данных пользователя' 
        });
    }
});

// Функция для получения описания тарифных возможностей
function getTariffFeatures(tariff) {
    if (!tariff) return [];
    
    return [
        `${tariff.includedMinutes || 0} минут местных звонков`,
        `${tariff.internetGB || 0} ГБ интернета`,
        `${tariff.smsCount || 0} SMS сообщений`,
        `Местные звонки сверх лимита: ${(tariff.minutePrice || 0.10).toFixed(2)} BYN/мин`,
        `Интернет сверх лимита: ${(tariff.internetPricePerMB || 0.01).toFixed(3)} BYN/МБ`,
        `SMS сверх лимита: ${(tariff.smsPrice || 0.05).toFixed(2)} BYN`,
        `Международные звонки: ${(tariff.internationalMinutePrice || 1.50).toFixed(2)} BYN/мин`
    ];
}

// Функция для получения описания тарифных возможностей
function getTariffFeatures(tariff) {
    if (!tariff) return [];
    
    return [
        `${tariff.includedMinutes || 0} минут местных звонков`,
        `${tariff.internetGB || 0} ГБ интернета`,
        `${tariff.smsCount || 0} SMS сообщений`
    ];
}

// Получение данных использования услуг
app.get('/api/user/usage', (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Не указан телефон'
            });
        }
        
        const user = database.users.find(u => u.phone === phone);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Получаем тариф пользователя
        const tariff = user.tariff || TARIFFS.standard;
        
        // Расчетные данные использования (можно заменить реальными данными)
        const today = new Date();
        const monthDay = today.getDate();
        const monthDays = 30; // Упрощенный расчет
        
        // Интернет трафик
        const internetUsed = Math.min(tariff.internetGB * monthDay / monthDays, tariff.internetGB * 0.8);
        const internetOverLimit = Math.max(0, internetUsed - tariff.internetGB);
        const internetOverCost = internetOverLimit * 1024 * (tariff.internetPricePerMB || 0.01);
        
        // Звонки
        const callsUsed = Math.min(tariff.includedMinutes * monthDay / monthDays, tariff.includedMinutes * 0.7);
        const callsOverLimit = Math.max(0, callsUsed - tariff.includedMinutes);
        const callsOverCost = callsOverLimit * (tariff.minutePrice || 0.10);
        
        // SMS
        const smsUsed = Math.min(tariff.smsCount * monthDay / monthDays, tariff.smsCount * 0.6);
        const smsOverLimit = Math.max(0, smsUsed - tariff.smsCount);
        const smsOverCost = smsOverLimit * (tariff.smsPrice || 0.05);
        
        // Международные звонки (отдельный расчет)
        const internationalCalls = 15; // минут
        
        const usageData = {
            success: true,
            internet: {
                used: parseFloat(internetUsed.toFixed(2)),
                total: tariff.internetGB || 15,
                overLimit: parseFloat(internetOverLimit.toFixed(2)),
                overCost: parseFloat(internetOverCost.toFixed(2)),
                pricePerMB: tariff.internetPricePerMB || 0.01
            },
            calls: {
                used: Math.round(callsUsed),
                total: tariff.includedMinutes || 300,
                international: internationalCalls,
                totalMinutes: Math.round(callsUsed + internationalCalls),
                overLimit: callsOverLimit,
                overCost: parseFloat(callsOverCost.toFixed(2)),
                minutePrice: tariff.minutePrice || 0.10,
                internationalMinutePrice: tariff.internationalMinutePrice || 1.50
            },
            sms: {
                used: Math.round(smsUsed),
                total: tariff.smsCount || 100,
                overLimit: smsOverLimit,
                overCost: parseFloat(smsOverCost.toFixed(2)),
                smsPrice: tariff.smsPrice || 0.05
            },
            totalOverCost: parseFloat((internetOverCost + callsOverCost + smsOverCost).toFixed(2))
        };
        
        res.json(usageData);
        
    } catch (error) {
        console.error('❌ Ошибка получения данных использования:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения данных использования' 
        });
    }
});

// Получение детальной истории использования
app.get('/api/user/usage/detailed', (req, res) => {
    try {
        const { 
            phone, 
            type = '', 
            startDate = '', 
            endDate = '',
            page = 1, 
            limit = 20 
        } = req.query;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Не указан телефон'
            });
        }
        
        const user = database.users.find(u => u.phone === phone);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Генерируем тестовые данные истории
        const history = generateTestHistory();
        
        // Фильтрация по типу
        let filteredHistory = history;
        if (type === 'calls') {
            filteredHistory = history.filter(item => item.type === 'call');
        } else if (type === 'internet') {
            filteredHistory = history.filter(item => item.type === 'internet');
        } else if (type === 'sms') {
            filteredHistory = history.filter(item => item.type === 'sms');
        }
        
        // Пагинация
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        
        const paginatedHistory = filteredHistory.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            data: paginatedHistory,
            total: filteredHistory.length,
            page: pageNum,
            totalPages: Math.ceil(filteredHistory.length / limitNum)
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения детальной истории:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории использования' 
        });
    }
});

// Функция генерации тестовой истории
function generateTestHistory() {
    const history = [];
    const now = new Date();
    
    // Звонки (30 записей)
    for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - i * 86400000);
        history.push({
            type: 'call',
            date: date.toLocaleString('ru-RU'),
            details: Math.random() > 0.3 ? 'Местный звонок' : 'Международный звонок',
            number: `+37529${Math.floor(1000000 + Math.random() * 9000000)}`,
            duration: `${Math.floor(Math.random() * 30)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
            cost: Math.random() > 0.7 ? `${(Math.random() * 5).toFixed(2)} BYN` : '0.00 BYN'
        });
    }
    
    // Интернет (20 записей)
    for (let i = 0; i < 20; i++) {
        const date = new Date(now.getTime() - i * 43200000); // каждые 12 часов
        const volume = (Math.random() * 500 + 50).toFixed(2);
        history.push({
            type: 'internet',
            date: date.toLocaleString('ru-RU'),
            details: Math.random() > 0.5 ? 'Мобильный интернет' : 'Wi-Fi точка',
            volume: `${volume} МБ`,
            duration: `${Math.floor(Math.random() * 6)}ч ${Math.floor(Math.random() * 60)}м`,
            cost: Math.random() > 0.8 ? `${(Math.random() * 3).toFixed(2)} BYN` : '0.00 BYN'
        });
    }
    
    // SMS (15 записей)
    for (let i = 0; i < 15; i++) {
        const date = new Date(now.getTime() - i * 172800000); // каждые 2 дня
        history.push({
            type: 'sms',
            date: date.toLocaleString('ru-RU'),
            details: 'Исходящее SMS',
            recipient: `+37529${Math.floor(1000000 + Math.random() * 9000000)}`,
            length: `${Math.floor(Math.random() * 100 + 20)} символов`,
            cost: Math.random() > 0.9 ? `${(Math.random() * 2).toFixed(2)} BYN` : '0.00 BYN'
        });
    }
    
    // Сортировка по дате (новые сверху)
    return history.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Получение списка тарифов
app.get('/api/tariffs', (req, res) => {
    try {
        const tariffs = Object.values(TARIFFS).map(tariff => ({
            id: tariff.id,
            name: tariff.name,
            price: `${tariff.price.toFixed(2)} BYN`,
            minutePrice: `${tariff.minutePrice.toFixed(2)} BYN`,
            internetPricePerMB: `${tariff.internetPricePerMB.toFixed(3)} BYN`,
            smsPrice: `${tariff.smsPrice.toFixed(2)} BYN`,
            features: [
                `${tariff.includedMinutes} минут местных звонков`,
                `${tariff.internetGB} ГБ интернета`,
                `${tariff.smsCount} SMS сообщений`,
                `Международные звонки: ${tariff.internationalMinutePrice.toFixed(2)} BYN/мин`
            ]
        }));
        
        res.json({
            success: true,
            tariffs: tariffs
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения списка тарифов:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения списка тарифов' 
        });
    }
});

// Смена тарифа
app.post('/api/user/tariff/change', (req, res) => {
    try {
        const { phone, tariffId } = req.body;
        
        if (!phone || !tariffId) {
            return res.status(400).json({
                success: false,
                error: 'Не указаны необходимые данные'
            });
        }
        
        const userIndex = database.users.findIndex(u => u.phone === phone);
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        const newTariff = TARIFFS[tariffId];
        if (!newTariff) {
            return res.status(400).json({
                success: false,
                error: 'Указанный тариф не найден'
            });
        }
        
        console.log('🔄 Смена тарифа:', {
            user: database.users[userIndex].fio,
            oldTariff: database.users[userIndex].tariff?.name || 'Не указан',
            newTariff: newTariff.name
        });
        
        // Сохраняем полные данные тарифа
        database.users[userIndex].tariff = {
            id: newTariff.id,
            name: newTariff.name,
            price: newTariff.price,
            includedMinutes: newTariff.includedMinutes,
            internetGB: newTariff.internetGB,
            smsCount: newTariff.smsCount,
            minutePrice: newTariff.minutePrice,
            internetPricePerMB: newTariff.internetPricePerMB,
            smsPrice: newTariff.smsPrice,
            internationalMinutePrice: newTariff.internationalMinutePrice
        };
        
        // Сохраняем изменения
        saveDatabase();
        
        // Формируем полные данные для ответа
        const fullTariffData = {
            ...newTariff,
            features: getTariffFeatures(newTariff)
        };
        
        res.json({
            success: true,
            message: 'Тариф успешно изменен',
            newTariff: fullTariffData
        });
        
    } catch (error) {
        console.error('❌ Ошибка смены тарифа:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка смены тарифа' 
        });
    }
});

// Регистрация нового пользователя
app.post('/api/register', async (req, res) => {
    try {
        const { fio, phone, password, tariff = 'standard' } = req.body;
        
        console.log('📝 Регистрация нового пользователя:', { fio, phone });
        
        if (!fio || !phone || !password) {
            return res.json({
                success: false,
                message: 'Заполните все обязательные поля'
            });
        }

        // Проверяем уникальность номера телефона
        if (database.users.some(u => u.phone === phone)) {
            return res.json({
                success: false,
                message: 'Пользователь с таким номером телефона уже существует'
            });
        }

        // Проверяем формат телефона
        if (!/^\+375[0-9]{9}$/.test(phone.replace(/\s/g, ''))) {
            return res.json({
                success: false,
                message: 'Неверный формат номера телефона. Используйте формат: +375XXXXXXXXX'
            });
        }

        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Получаем тариф
        const selectedTariff = TARIFFS[tariff] || TARIFFS.standard;
        
        // Создаем нового пользователя
        const newUser = {
            _id: `user_${database.nextUserId.toString().padStart(3, '0')}`,
            fio: fio.trim(),
            phone: phone.replace(/\s/g, ''),
            password: hashedPassword,
            role: 'client',
            balance: 0,
            tariff: {
                id: selectedTariff.id,
                name: selectedTariff.name,
                price: selectedTariff.price,
                includedMinutes: selectedTariff.includedMinutes,
                internetGB: selectedTariff.internetGB,
                smsCount: selectedTariff.smsCount,
                minutePrice: selectedTariff.minutePrice,
                internetPricePerMB: selectedTariff.internetPricePerMB,
                smsPrice: selectedTariff.smsPrice,
                internationalMinutePrice: selectedTariff.internationalMinutePrice
            },
            creditLimit: 50,
            status: 'active',
            debt: 0,
            createdAt: new Date()
        };

        // Добавляем пользователя в базу
        database.users.push(newUser);
        database.nextUserId++;
        
        // Сохраняем изменения
        saveDatabase();

        console.log('✅ Пользователь зарегистрирован:', newUser.fio);
        
        // Формируем ответ без пароля
        const userResponse = {
            _id: newUser._id,
            fio: newUser.fio,
            phone: newUser.phone,
            role: newUser.role,
            balance: newUser.balance,
            creditLimit: newUser.creditLimit,
            status: newUser.status,
            tariff: newUser.tariff,
            debt: newUser.debt,
            createdAt: newUser.createdAt
        };

        res.json({
            success: true,
            message: 'Регистрация прошла успешно! Теперь вы можете войти в систему.',
            user: userResponse
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.json({
            success: false,
            message: 'Ошибка сервера при регистрации'
        });
    }
});

// Авторизация
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.json({ 
                success: false, 
                message: 'Заполните все поля' 
            });
        }

        // Нормализуем номер телефона (убираем пробелы, дефисы)
        const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
        
        const user = database.users.find(u => {
            const userPhoneNormalized = u.phone.replace(/[\s\-\(\)]/g, '');
            return userPhoneNormalized === normalizedPhone;
        });
        
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'Пользователь не найден' 
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.json({ 
                success: false, 
                message: 'Неверный пароль' 
            });
        }

        // Формируем полные данные тарифа
        let tariffData;
        if (user.tariff && user.tariff.id) {
            tariffData = TARIFFS[user.tariff.id] || TARIFFS.standard;
        } else if (typeof user.tariff === 'string') {
            tariffData = TARIFFS[user.tariff] || TARIFFS.standard;
        } else {
            tariffData = user.tariff || TARIFFS.standard;
        }

        const fullTariffData = {
            id: tariffData.id || 'standard',
            name: tariffData.name || 'Стандарт',
            price: tariffData.price || 19.99,
            includedMinutes: tariffData.includedMinutes || 300,
            internetGB: tariffData.internetGB || 15,
            smsCount: tariffData.smsCount || 100,
            minutePrice: tariffData.minutePrice || 0.10,
            internetPricePerMB: tariffData.internetPricePerMB || 0.01,
            smsPrice: tariffData.smsPrice || 0.05,
            internationalMinutePrice: tariffData.internationalMinutePrice || 1.50,
            features: getTariffFeatures(tariffData)
        };

        const userData = {
            _id: user._id,
            fio: user.fio,
            phone: user.phone,
            role: user.role,
            balance: user.balance || 0,
            creditLimit: user.creditLimit || 50,
            status: user.status || 'active',
            tariff: fullTariffData,
            debt: user.debt || 0,
            createdAt: user.createdAt
        };

        const redirectUrl = user.role === 'admin' ? '/admin' : '/client';
        
        res.json({ 
            success: true, 
            redirect: redirectUrl,
            user: userData
        });

    } catch (error) {
        console.error('❌ Ошибка авторизации:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка сервера' 
        });
    }
});

// Получение услуг пользователя
app.get('/api/user/services', (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Не указан телефон'
            });
        }
        
        const user = database.users.find(u => u.phone === phone);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Получаем услуги пользователя из базы
        const userServices = database.userServices.filter(service => 
            service.userId === user._id && service.active
        );
        
        // Формируем ответ
        const services = userServices.map(service => ({
            id: service.serviceId,
            name: service.name || 'Услуга',
            category: service.category || 'другое',
            price: `${service.price || 0} BYN`,
            description: service.description || 'Дополнительная услуга',
            active: true
        }));
        
        // Добавляем доступные услуги, которые не подключены
        const availableServices = [
            {
                id: 'antivirus',
                name: 'Антивирус',
                category: 'безопасность',
                price: '2.99 BYN',
                description: 'Защита устройства от вирусов и вредоносных программ',
                active: services.some(s => s.id === 'antivirus')
            },
            {
                id: 'music',
                name: 'Музыка',
                category: 'развлечения',
                price: '4.99 BYN',
                description: 'Стриминг музыки без рекламы и ограничений',
                active: services.some(s => s.id === 'music')
            },
            {
                id: 'cloud',
                name: 'Облако',
                category: 'хранилище',
                price: '1.99 BYN',
                description: '50 ГБ облачного хранилища для файлов',
                active: services.some(s => s.id === 'cloud')
            },
            {
                id: 'games',
                name: 'Игровая подписка',
                category: 'развлечения',
                price: '3.99 BYN',
                description: 'Доступ к каталогу мобильных игр',
                active: services.some(s => s.id === 'games')
            }
        ];
        
        res.json({
            success: true,
            services: availableServices
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения услуг пользователя:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения услуг пользователя' 
        });
    }
});

// Управление услугами пользователя
app.post('/api/user/services/toggle', (req, res) => {
    try {
        const { phone, serviceId, activate } = req.body;
        
        if (!phone || !serviceId || activate === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Не указаны необходимые данные'
            });
        }
        
        const user = database.users.find(u => u.phone === phone);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Находим или создаем услугу
        let service = database.userServices.find(s => 
            s.userId === user._id && s.serviceId === serviceId
        );
        
        if (activate) {
            // Подключаем услугу
            if (!service) {
                service = {
                    _id: `service_${database.nextServiceId}`,
                    userId: user._id,
                    serviceId: serviceId,
                    name: getServiceName(serviceId),
                    price: getServicePrice(serviceId),
                    description: getServiceDescription(serviceId),
                    category: getServiceCategory(serviceId),
                    active: true,
                    activatedAt: new Date()
                };
                database.userServices.push(service);
                database.nextServiceId++;
            } else {
                service.active = true;
            }
        } else {
            // Отключаем услугу
            if (service) {
                service.active = false;
            }
        }
        
        // Сохраняем изменения
        saveDatabase();
        
        res.json({
            success: true,
            message: `Услуга ${activate ? 'подключена' : 'отключена'}`
        });
        
    } catch (error) {
        console.error('❌ Ошибка управления услугами:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка управления услугами' 
        });
    }
});

// Вспомогательные функции для услуг
function getServiceName(serviceId) {
    const names = {
        'antivirus': 'Антивирус',
        'music': 'Музыка',
        'cloud': 'Облако',
        'games': 'Игровая подписка'
    };
    return names[serviceId] || 'Услуга';
}

function getServicePrice(serviceId) {
    const prices = {
        'antivirus': 2.99,
        'music': 4.99,
        'cloud': 1.99,
        'games': 3.99
    };
    return prices[serviceId] || 1.99;
}

function getServiceDescription(serviceId) {
    const descriptions = {
        'antivirus': 'Защита устройства от вирусов и вредоносных программ',
        'music': 'Стриминг музыки без рекламы и ограничений',
        'cloud': '50 ГБ облачного хранилища для файлов',
        'games': 'Доступ к каталогу мобильных игр'
    };
    return descriptions[serviceId] || 'Дополнительная услуга';
}

function getServiceCategory(serviceId) {
    const categories = {
        'antivirus': 'безопасность',
        'music': 'развлечения',
        'cloud': 'хранилище',
        'games': 'развлечения'
    };
    return categories[serviceId] || 'другое';
}

// Пополнение баланса
app.post('/api/payment/topup', (req, res) => {
    try {
        const { phone, amount } = req.body;
        
        if (!phone || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Не указаны необходимые данные'
            });
        }
        
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Некорректная сумма'
            });
        }
        
        const userIndex = database.users.findIndex(u => u.phone === phone);
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Пополняем баланс
        database.users[userIndex].balance += amountNum;
        
        // Создаем запись о платеже
        const payment = {
            _id: `payment_${database.nextPaymentId.toString().padStart(3, '0')}`,
            userId: database.users[userIndex]._id,
            phone: phone,
            amount: amountNum,
            type: 'topup',
            method: 'online',
            date: new Date(),
            status: 'completed'
        };
        
        database.payments.push(payment);
        database.nextPaymentId++;
        
        // Сохраняем изменения
        saveDatabase();
        
        res.json({
            success: true,
            message: `Баланс успешно пополнен на ${amountNum.toFixed(2)} BYN`,
            newBalance: database.users[userIndex].balance
        });
        
    } catch (error) {
        console.error('❌ Ошибка пополнения баланса:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка пополнения баланса' 
        });
    }
});

// Обновление настроек пользователя
app.put('/api/user/settings', (req, res) => {
    try {
        const { phone, fio } = req.body;
        
        if (!phone || !fio) {
            return res.status(400).json({
                success: false,
                error: 'Не указаны необходимые данные'
            });
        }
        
        const userIndex = database.users.findIndex(u => u.phone === phone);
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Обновляем ФИО
        database.users[userIndex].fio = fio.trim();
        
        // Сохраняем изменения
        saveDatabase();
        
        res.json({
            success: true,
            message: 'Настройки успешно сохранены',
            user: database.users[userIndex]
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления настроек:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка обновления настроек' 
        });
    }
});

// Получение новостей
app.get('/api/news', (req, res) => {
    try {
        const news = [
            {
                title: 'Новый тариф "Премиум"',
                date: new Date().toLocaleDateString('ru-RU'),
                content: 'Скоро в продаже новый тарифный план с увеличенными лимитами и бонусами'
            },
            {
                title: 'Технические работы завершены',
                date: new Date(Date.now() - 86400000).toLocaleDateString('ru-RU'),
                content: 'Плановые технические работы успешно завершены. Все системы работают в штатном режиме'
            },
            {
                title: 'Акция "Приведи друга"',
                date: new Date(Date.now() - 2 * 86400000).toLocaleDateString('ru-RU'),
                content: 'Пригласите друга стать нашим клиентом и получите 10 BYN на баланс!'
            },
            {
                title: 'Обновление мобильного приложения',
                date: new Date(Date.now() - 3 * 86400000).toLocaleDateString('ru-RU'),
                content: 'Вышла новая версия мобильного приложения с улучшенным интерфейсом'
            },
            {
                title: 'Изменение тарифов',
                date: new Date(Date.now() - 5 * 86400000).toLocaleDateString('ru-RU'),
                content: 'С 1 декабря вступают в силу новые условия тарифных планов'
            }
        ];
        
        res.json({
            success: true,
            news: news
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения новостей:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения новостей' 
        });
    }
});

// ========== ЗАПУСК СЕРВЕРА ==========
async function startServer() {
    try {
        console.log('🚀 Запуск сервера мобильного оператора...');
        console.log('═════════════════════════════════════════');
        
        // Проверяем шрифты
        checkFonts();
        
        // Инициализируем данные
        await initializeTestData();
        
        app.listen(PORT, () => {
            console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
            console.log(`📞 Мобильный оператор - Панель управления`);
            console.log('═════════════════════════════════════════');
            console.log(`👤 Администратор: +375256082909 / 123123`);
            console.log(`📊 Основные страницы:`);
            console.log(`   • Вход: http://localhost:${PORT}/`);
            console.log(`   • Админ-панель: http://localhost:${PORT}/admin`);
            console.log(`   • Клиент-панель: http://localhost:${PORT}/client`);
            console.log('═════════════════════════════════════════');
            console.log(`📄 Отчеты PDF (русский текст):`);
            console.log(`   • Тестовый отчет: http://localhost:${PORT}/api/reports/test/pdf`);
            console.log(`   • Все пользователи: http://localhost:${PORT}/api/reports/users/pdf`);
            console.log(`   • Должники: http://localhost:${PORT}/api/reports/debtors/pdf`);
            console.log(`   • Простой отчет (англ): http://localhost:${PORT}/api/reports/simple/users/pdf`);
            console.log('═════════════════════════════════════════');
            console.log(`📊 Статистика:`);
            console.log(`   • Всего пользователей: ${database.users.length}`);
            console.log(`   • Клиентов: ${database.users.filter(u => u.role === 'client').length}`);
            console.log('═════════════════════════════════════════');
        });
        
    } catch (error) {
        console.error('❌ Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

startServer();