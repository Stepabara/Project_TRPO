const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

// Подключение к MongoDB
const mongoOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

let isConnected = false;

async function connectToDatabase() {
    try {
        await mongoose.connect('mongodb://localhost:27017/mobile_operator', mongoOptions);
        isConnected = true;
        console.log('✅ Успешное подключение к MongoDB');
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ Ошибка MongoDB:', err);
            isConnected = false;
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('🔌 MongoDB отключена');
            isConnected = false;
        });
        
    } catch (err) {
        console.error('❌ Ошибка подключения к MongoDB:', err);
        process.exit(1);
    }
}

// Схема пользователя (обновленная)
const userSchema = new mongoose.Schema({
    fio: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'client'], default: 'client' },
    balance: { type: Number, default: 0 },
    tariff: { 
        id: { type: String, default: 'standard' },
        name: { type: String, default: 'Стандарт' },
        price: { type: Number, default: 19.99 },
        includedMinutes: { type: Number, default: 300 },
        internetGB: { type: Number, default: 15 },
        smsCount: { type: Number, default: 100 },
        minutePrice: { type: Number, default: 0.10 },
        internationalMinutePrice: { type: Number, default: 1.50 }
    },
    creditLimit: { type: Number, default: 50 },
    status: { type: String, default: 'active' },
    registrationDate: { type: Date, default: Date.now },
    debt: { type: Number, default: 0 }
});

// Схема звонков
const callSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userFio: { type: String, required: true },
    phone: { type: String, required: true },
    callType: { type: String, enum: ['local', 'international'], required: true },
    number: { type: String, required: true },
    duration: { type: Number, required: true },
    cost: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    month: { type: String, required: true }
});

// Схема платежей (обновленная)
const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true },
    date: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['topup', 'subscription', 'call_payment', 'tariff_change', 'withdrawal'], 
        default: 'topup' 
    }
});

const User = mongoose.model('User', userSchema);
const Call = mongoose.model('Call', callSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// Тарифы в белорусских рублях
const TARIFFS = {
    'standard': { 
        id: 'standard', 
        name: 'Стандарт', 
        price: 19.99,
        includedMinutes: 300,
        internetGB: 15,
        smsCount: 100,
        minutePrice: 0.10,
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
        internationalMinutePrice: 1.50
    }
};

// Middleware
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

// Проверка подключения к БД
function checkDatabaseConnection(req, res, next) {
    if (!isConnected) {
        return res.status(503).json({ 
            success: false, 
            message: 'База данных не доступна' 
        });
    }
    next();
}

// Создание администратора
async function checkAdmin() {
    try {
        const adminExists = await User.findOne({ phone: '+375256082909' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('123123', 10);
            await User.create({
                fio: 'Администратор',
                phone: '+375256082909',
                password: hashedPassword,
                role: 'admin',
                tariff: TARIFFS.standard,
                creditLimit: 100,
                registrationDate: new Date()
            });
            console.log('✅ Администратор создан');
        }
    } catch (error) {
        console.error('Ошибка создания администратора:', error);
    }
}

// Создание тестовых данных при запуске (обновленное)
async function createTestData() {
    try {
        const userCount = await User.countDocuments({ role: 'client' });
        if (userCount === 0) {
            console.log('📝 Создание тестовых данных...');
            
            const testUsers = [
                {
                    fio: 'Иванов Иван Иванович',
                    phone: '+375291234567',
                    password: '123123',
                    balance: 150.50,
                    tariff: TARIFFS.standard,
                    creditLimit: 50
                },
                {
                    fio: 'Петров Петр Петрович', 
                    phone: '+375292345678',
                    password: '123123',
                    balance: -25.00,
                    tariff: TARIFFS['plus+'],
                    creditLimit: 50
                },
                {
                    fio: 'Сидорова Анна Михайловна',
                    phone: '+375293456789',
                    password: '123123',
                    balance: 75.00,
                    tariff: TARIFFS['Super plus'],
                    creditLimit: 50
                }
            ];
            
            for (const userData of testUsers) {
                const hashedPassword = await bcrypt.hash(userData.password, 10);
                
                const user = new User({
                    fio: userData.fio,
                    phone: userData.phone,
                    password: hashedPassword,
                    balance: userData.balance,
                    tariff: userData.tariff,
                    creditLimit: userData.creditLimit,
                    role: 'client',
                    registrationDate: new Date()
                });
                
                await user.save();
                
                // Создаем тестовые звонки
                const call = new Call({
                    userId: user._id,
                    userFio: user.fio,
                    phone: user.phone,
                    callType: 'local',
                    number: '+375291111111',
                    duration: Math.floor(Math.random() * 30) + 1,
                    cost: Math.random() * 5,
                    date: new Date(),
                    month: new Date().toISOString().slice(0, 7)
                });
                await call.save();
            }
            
            console.log('✅ Тестовые данные созданы');
        }
    } catch (error) {
        console.error('❌ Ошибка создания тестовых данных:', error);
    }
}

// ========== ОСНОВНЫЕ РОУТЫ ==========

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/client', (req, res) => {
    res.sendFile(path.join(__dirname, 'client.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Авторизация
app.post('/api/login', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.json({ 
                success: false, 
                message: 'Заполните все поля' 
            });
        }

        const user = await User.findOne({ phone }).select('+password');
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
            fio: user.fio,
            phone: user.phone,
            role: user.role,
            balance: user.balance || 0,
            creditLimit: user.creditLimit || 50,
            status: user.status || 'active',
            tariff: user.tariff,
            registrationDate: user.registrationDate.toLocaleDateString('ru-RU'),
            debt: user.debt || 0
        };

        const redirectUrl = user.role === 'admin' ? '/admin' : '/client';
        
        res.json({ 
            success: true, 
            redirect: redirectUrl,
            user: userData
        });

    } catch (error) {
        console.error('Ошибка авторизации:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка сервера' 
        });
    }
});

// Регистрация (добавление клиента)
app.post('/api/register', checkDatabaseConnection, async (req, res) => {
    try {
        const { fio, phone, password, balance = 0, tariff = 'standard' } = req.body;

        if (!fio || !phone || !password) {
            return res.json({ 
                success: false, 
                message: 'Заполните обязательные поля' 
            });
        }

        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.json({ 
                success: false, 
                message: 'Пользователь с таким номером уже существует' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Получаем выбранный тариф
        const selectedTariff = TARIFFS[tariff] || TARIFFS.standard;

        const newUser = new User({
            fio,
            phone,
            password: hashedPassword,
            balance: parseFloat(balance),
            tariff: selectedTariff,
            creditLimit: 50,
            role: 'client',
            registrationDate: new Date()
        });

        await newUser.save();

        // Если указан начальный баланс, создаем запись о платеже
        if (balance > 0) {
            const payment = new Payment({
                userId: newUser._id,
                phone: newUser.phone,
                amount: parseFloat(balance),
                method: 'Начальный баланс',
                type: 'topup'
            });
            await payment.save();
        }

        res.json({ 
            success: true, 
            message: 'Клиент успешно добавлен!',
            user: {
                fio: newUser.fio,
                phone: newUser.phone,
                balance: newUser.balance,
                tariff: newUser.tariff,
                creditLimit: newUser.creditLimit,
                registrationDate: newUser.registrationDate.toLocaleDateString('ru-RU')
            }
        });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка сервера' 
        });
    }
});

// Регистрация нового звонка
app.post('/api/calls/register', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, number, duration, callType } = req.body;
        
        if (!phone || !number || !duration || !callType) {
            return res.status(400).json({ 
                success: false,
                error: 'Не все поля заполнены' 
            });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Расчет стоимости звонка
        let cost = 0;
        if (callType === 'international') {
            cost = duration * (user.tariff.internationalMinutePrice || 1.50);
        } else {
            cost = duration * (user.tariff.minutePrice || 0.10);
        }

        // Создаем запись о звонке
        const call = new Call({
            userId: user._id,
            userFio: user.fio,
            phone: user.phone,
            callType,
            number,
            duration,
            cost,
            month: new Date().toISOString().slice(0, 7)
        });

        await call.save();

        // Списание стоимости звонка с баланса
        user.balance -= cost;
        if (user.balance < 0) {
            user.debt = Math.abs(user.balance);
        }
        await user.save();

        res.json({ 
            success: true, 
            message: 'Звонок успешно зарегистрирован',
            call: {
                date: call.date.toLocaleString('ru-RU'),
                number: call.number,
                type: call.callType === 'local' ? 'Местный' : 'Международный',
                duration: `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`,
                cost: `${call.cost.toFixed(2)} BYN`
            }
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации звонка:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка регистрации звонка' 
        });
    }
});

// Пополнение баланса
app.post('/api/payment/topup', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, amount } = req.body;
        
        if (!phone || !amount || amount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Неверные данные для пополнения' 
            });
        }

        const amountNumber = parseFloat(amount);
        if (isNaN(amountNumber)) {
            return res.status(400).json({ 
                success: false,
                error: 'Неверная сумма пополнения' 
            });
        }

        const user = await User.findOne({ phone: phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Обновляем баланс
        user.balance += amountNumber;
        if (user.balance >= 0) {
            user.debt = 0;
        }
        await user.save();

        // Создаем запись о платеже
        const payment = new Payment({
            userId: user._id,
            phone: user.phone,
            amount: amountNumber,
            method: 'Банковская карта',
            type: 'topup'
        });
        await payment.save();

        res.json({ 
            success: true, 
            message: `Баланс успешно пополнен на ${amountNumber} BYN`,
            newBalance: user.balance,
            debt: user.debt
        });

    } catch (error) {
        console.error('❌ Ошибка пополнения баланса:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка пополнения баланса: ' + error.message 
        });
    }
});

// API для списания средств
app.post('/api/payment/withdraw', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, amount } = req.body;
        
        if (!phone || !amount || amount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Неверные данные для списания' 
            });
        }

        const amountNumber = parseFloat(amount);
        if (isNaN(amountNumber)) {
            return res.status(400).json({ 
                success: false,
                error: 'Неверная сумма списания' 
            });
        }

        const user = await User.findOne({ phone: phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Проверяем достаточно ли средств с учетом кредитного лимита
        const availableBalance = user.balance + (user.creditLimit || 0);
        if (amountNumber > availableBalance) {
            return res.status(400).json({ 
                success: false,
                error: 'Недостаточно средств для списания' 
            });
        }

        // Списание средств
        const oldBalance = user.balance;
        user.balance -= amountNumber;
        
        // Обновляем долг если баланс отрицательный
        if (user.balance < 0) {
            user.debt = Math.abs(user.balance);
        } else {
            user.debt = 0;
        }
        
        await user.save();

        // Создаем запись о платеже
        const payment = new Payment({
            userId: user._id,
            phone: user.phone,
            amount: -amountNumber,
            method: 'Административное списание',
            type: 'withdrawal',
            date: new Date()
        });
        await payment.save();

        console.log(`✅ Списание средств: ${user.phone}, сумма: ${amountNumber}, старый баланс: ${oldBalance}, новый баланс: ${user.balance}`);

        res.json({ 
            success: true, 
            message: `Успешно списано ${amountNumber} BYN`,
            newBalance: user.balance,
            debt: user.debt
        });

    } catch (error) {
        console.error('❌ Ошибка списания средств:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка списания средств: ' + error.message 
        });
    }
});

// API для обновления настроек пользователя
app.put('/api/user/settings', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, fio, status, creditLimit } = req.body;

        if (!phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указан телефон пользователя' 
            });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Обновляем данные
        const updateData = {};
        if (fio) updateData.fio = fio;
        if (status) updateData.status = status;
        if (creditLimit !== undefined) updateData.creditLimit = parseFloat(creditLimit);

        await User.updateOne({ phone }, { $set: updateData });

        console.log(`✅ Настройки пользователя обновлены: ${phone}`);

        res.json({ 
            success: true, 
            message: 'Настройки пользователя обновлены',
            user: {
                fio: fio || user.fio,
                phone: user.phone,
                status: status || user.status,
                creditLimit: creditLimit !== undefined ? parseFloat(creditLimit) : user.creditLimit
            }
        });

    } catch (error) {
        console.error('❌ Ошибка обновления настроек пользователя:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка обновления настроек пользователя' 
        });
    }
});

// API для админ-панели - получение всех клиентов
app.get('/api/admin/clients', checkDatabaseConnection, async (req, res) => {
    try {
        const { search, status, tariff, page = 1, limit = 50 } = req.query;
        
        let filter = { role: 'client' };
        
        // Поиск по ФИО или телефону
        if (search) {
            filter.$or = [
                { fio: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Фильтр по статусу
        if (status === 'debtor') {
            filter.debt = { $gt: 0 };
        } else if (status === 'active') {
            filter.balance = { $gte: 0 };
        }
        
        // Фильтр по тарифу
        if (tariff) {
            filter['tariff.id'] = tariff;
        }
        
        const clients = await User.find(filter)
            .select('fio phone balance debt status tariff creditLimit registrationDate')
            .sort({ registrationDate: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        // Форматируем данные для фронтенда
        const clientsWithFormattedData = clients.map(client => ({
            _id: client._id,
            fio: client.fio,
            phone: client.phone,
            balance: client.balance?.toFixed(2) + ' BYN',
            debt: (client.debt || 0).toFixed(2) + ' BYN',
            status: client.status,
            tariff: {
                id: client.tariff?.id || 'standard',
                name: client.tariff?.name || 'Стандарт',
                price: client.tariff?.price || 19.99
            },
            creditLimit: client.creditLimit || 50,
            registrationDate: client.registrationDate ? client.registrationDate.toLocaleDateString('ru-RU') : 'Не указана'
        }));
        
        const total = await User.countDocuments(filter);
        
        res.json({
            success: true,
            clients: clientsWithFormattedData,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения клиентов:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения клиентов' 
        });
    }
});

// Получение истории звонков для админ-панели
app.get('/api/admin/calls', checkDatabaseConnection, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            phone, 
            callType, 
            startDate, 
            endDate 
        } = req.query;

        let filter = {};

        // Фильтр по номеру телефона
        if (phone) {
            filter.phone = { $regex: phone, $options: 'i' };
        }

        // Фильтр по типу звонка
        if (callType) {
            filter.callType = callType;
        }

        // Фильтр по дате
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Получаем звонки с пагинацией
        const calls = await Call.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Получаем общее количество для пагинации
        const totalCalls = await Call.countDocuments(filter);

        // Получаем статистику
        const totalLocalCalls = await Call.countDocuments({ ...filter, callType: 'local' });
        const totalInternationalCalls = await Call.countDocuments({ ...filter, callType: 'international' });
        
        const costAggregation = await Call.aggregate([
            { $match: filter },
            { $group: { _id: null, totalCost: { $sum: '$cost' } } }
        ]);
        const totalCost = costAggregation.length > 0 ? costAggregation[0].totalCost : 0;

        // Форматируем данные для ответа
        const formattedCalls = calls.map(call => ({
            _id: call._id,
            date: call.date.toLocaleString('ru-RU'),
            userFio: call.userId?.fio || call.userFio || 'Неизвестно',
            phone: call.phone,
            number: call.number,
            callType: call.callType,
            duration: call.duration,
            cost: call.cost
        }));

        res.json({
            success: true,
            calls: formattedCalls,
            totalCalls,
            totalPages: Math.ceil(totalCalls / limitNum),
            currentPage: pageNum,
            localCalls: totalLocalCalls,
            internationalCalls: totalInternationalCalls,
            totalCost
        });

    } catch (error) {
        console.error('❌ Ошибка получения истории звонков:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории звонков' 
        });
    }
});

// Отчет о должниках
app.get('/api/reports/debtors', checkDatabaseConnection, async (req, res) => {
    try {
        const debtors = await User.find({ 
            debt: { $gt: 0 } 
        }).select('fio phone balance debt tariff status');

        const report = {
            success: true,
            totalDebtors: debtors.length,
            totalDebt: debtors.reduce((sum, user) => sum + user.debt, 0).toFixed(2) + ' BYN',
            debtors: debtors.map(user => ({
                fio: user.fio,
                phone: user.phone,
                balance: user.balance.toFixed(2) + ' BYN',
                debt: user.debt.toFixed(2) + ' BYN',
                tariff: user.tariff.name,
                status: user.status
            }))
        };

        res.json(report);
    } catch (error) {
        console.error('❌ Ошибка формирования отчета о должниках:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка формирования отчета' 
        });
    }
});

// Списание абонентской платы
app.post('/api/admin/charge-subscription', checkDatabaseConnection, async (req, res) => {
    try {
        const users = await User.find({ role: 'client', status: 'active' });
        
        if (users.length === 0) {
            return res.json({
                success: true,
                message: 'Нет активных клиентов для списания',
                results: []
            });
        }
        
        const results = [];
        const currentDate = new Date();
        
        for (const user of users) {
            try {
                const oldBalance = user.balance;
                const subscriptionAmount = user.tariff?.price || 19.99;
                
                // Списание абонентской платы
                user.balance -= subscriptionAmount;
                
                // Обновляем долг если баланс отрицательный
                if (user.balance < 0) {
                    user.debt = Math.abs(user.balance);
                }
                
                await user.save();
                
                // Создаем запись о платеже
                const payment = new Payment({
                    userId: user._id,
                    phone: user.phone,
                    amount: -subscriptionAmount,
                    method: 'Автосписание',
                    type: 'subscription',
                    date: currentDate
                });
                await payment.save();
                
                results.push({
                    user: user.fio,
                    phone: user.phone,
                    amount: subscriptionAmount.toFixed(2) + ' BYN',
                    oldBalance: oldBalance.toFixed(2) + ' BYN',
                    newBalance: user.balance.toFixed(2) + ' BYN',
                    debt: (user.debt || 0).toFixed(2) + ' BYN',
                    status: 'Успешно'
                });
                
            } catch (userError) {
                console.error(`Ошибка списания для пользователя ${user.phone}:`, userError);
                results.push({
                    user: user.fio,
                    phone: user.phone,
                    amount: '0 BYN',
                    oldBalance: user.balance.toFixed(2) + ' BYN',
                    newBalance: user.balance.toFixed(2) + ' BYN',
                    debt: (user.debt || 0).toFixed(2) + ' BYN',
                    status: 'Ошибка'
                });
            }
        }
        
        const successfulCharges = results.filter(r => r.status === 'Успешно').length;
        
        res.json({
            success: true,
            message: `Абонентская плата списана с ${successfulCharges} из ${users.length} пользователей`,
            results: results
        });
        
    } catch (error) {
        console.error('❌ Ошибка списания абонентской платы:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка списания абонентской платы' 
        });
    }
});

// Удаление пользователя (админ)
app.delete('/api/admin/clients/:id', checkDatabaseConnection, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Запрос удаления пользователя: ${id}`);
        
        // Находим пользователя
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }
        
        // Нельзя удалить администратора
        if (user.role === 'admin') {
            return res.status(403).json({ 
                success: false,
                error: 'Нельзя удалить администратора' 
            });
        }
        
        // Удаляем связанные данные пользователя
        await Promise.all([
            Call.deleteMany({ userId: id }),
            Payment.deleteMany({ userId: id })
        ]);
        
        // Удаляем самого пользователя
        await User.findByIdAndDelete(id);
        
        console.log(`✅ Пользователь ${user.fio} (${user.phone}) удален`);
        
        res.json({ 
            success: true, 
            message: `Пользователь ${user.fio} успешно удален`,
            deletedUser: {
                fio: user.fio,
                phone: user.phone
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка удаления пользователя:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка удаления пользователя: ' + error.message 
        });
    }
});

// Получение детальной статистики для админ-панели
app.get('/api/admin/statistics', checkDatabaseConnection, async (req, res) => {
    try {
        const totalClients = await User.countDocuments({ role: 'client' });
        const activeClients = await User.countDocuments({ 
            role: 'client', 
            balance: { $gte: 0 } 
        });
        const debtors = await User.countDocuments({ 
            role: 'client', 
            debt: { $gt: 0 } 
        });
        
        const totalDebtResult = await User.aggregate([
            { $match: { role: 'client', debt: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$debt' } } }
        ]);
        
        const totalDebt = totalDebtResult.length > 0 ? totalDebtResult[0].total : 0;
        
        // Статистика по тарифам
        const tariffStats = await User.aggregate([
            { $match: { role: 'client' } },
            { $group: { 
                _id: '$tariff.id', 
                count: { $sum: 1 },
                totalRevenue: { $sum: '$tariff.price' }
            } }
        ]);
        
        res.json({
            success: true,
            statistics: {
                totalClients,
                activeClients,
                debtors,
                totalDebt: totalDebt.toFixed(2),
                tariffStats
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения статистики' 
        });
    }
});

// ========== WORD ОТЧЕТЫ (ИСПРАВЛЕННЫЕ) ==========

// Функция для создания правильного Word документа
function createWordReport(reportData) {
    // Создаем простой HTML который можно открыть в Word
    const htmlContent = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' 
      xmlns:w='urn:schemas-microsoft-com:office:word' 
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset="utf-8">
    <title>${reportData.reportTitle}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 2cm; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #2c3e50; }
        .subtitle { font-size: 16px; color: #7f8c8d; margin-bottom: 20px; }
        .info { margin-bottom: 20px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        table th { background-color: #3498db; color: white; font-weight: bold; padding: 8px; border: 1px solid #ddd; text-align: left; }
        table td { padding: 8px; border: 1px solid #ddd; }
        .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e1e8ed; }
        .footer { margin-top: 30px; text-align: center; color: #7f8c8d; font-size: 11px; border-top: 1px solid #e1e8ed; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">${reportData.reportTitle}</div>
        <div class="subtitle">${reportData.reportSubtitle}</div>
        <div class="info">
            <strong>Период:</strong> ${reportData.period}<br>
            <strong>Дата формирования:</strong> ${reportData.generationDate}<br>
            <strong>Всего записей:</strong> ${reportData.totalRecords}
        </div>
    </div>

    ${reportData.summary ? `
    <div class="summary">
        <h3>Сводная информация:</h3>
        ${Object.entries(reportData.summary).map(([key, value]) => 
            `<p><strong>${key}:</strong> ${value}</p>`
        ).join('')}
    </div>
    ` : ''}

    ${reportData.tableData ? `
    <table>
        <thead>
            <tr>
                ${reportData.tableHeaders.map(header => `<th>${header}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${reportData.tableData.map(row => 
                `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
            ).join('')}
        </tbody>
    </table>
    ` : ''}

    <div class="footer">
        Отчет сгенерирован автоматически системой учета мобильного оператора "BryTech"<br>
        ${new Date().toLocaleString('ru-RU')}
    </div>
</body>
</html>`;

    return htmlContent;
}

// Отчет по всем пользователям в Word
app.get('/api/reports/users/word', checkDatabaseConnection, async (req, res) => {
    try {
        // Получаем всех пользователей
        const users = await User.find({ role: 'client' })
            .select('fio phone balance debt tariff status registrationDate')
            .sort({ fio: 1 });

        const tableData = users.map(user => [
            user.fio,
            user.phone,
            `${user.balance.toFixed(2)} BYN`,
            `${user.debt.toFixed(2)} BYN`,
            user.tariff.name,
            user.status,
            user.registrationDate.toLocaleDateString('ru-RU')
        ]);

        const summary = {
            'Всего пользователей': users.length,
            'Активных пользователей': users.filter(u => u.status === 'active').length,
            'Пользователей с долгами': users.filter(u => u.debt > 0).length,
            'Общая задолженность': `${users.reduce((sum, u) => sum + u.debt, 0).toFixed(2)} BYN`,
            'Общий баланс': `${users.reduce((sum, u) => sum + u.balance, 0).toFixed(2)} BYN`
        };

        const reportData = {
            reportTitle: 'ОТЧЕТ ПО ВСЕМ ПОЛЬЗОВАТЕЛЯМ',
            reportSubtitle: 'Мобильный оператор "BryTech"',
            period: 'За весь период',
            generationDate: new Date().toLocaleDateString('ru-RU'),
            totalRecords: users.length,
            summary: summary,
            tableHeaders: ['ФИО', 'Телефон', 'Баланс', 'Задолженность', 'Тариф', 'Статус', 'Дата регистрации'],
            tableData: tableData
        };

        const htmlReport = createWordReport(reportData);

        // Устанавливаем правильные заголовки для Word документа
        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="users_report_${new Date().toISOString().split('T')[0]}.doc"`);
        
        // Отправляем HTML как документ Word
        res.send(Buffer.from(htmlReport));

    } catch (error) {
        console.error('❌ Ошибка формирования отчета по пользователям:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка формирования отчета' 
        });
    }
});

// Отчет по всем звонкам в Word
app.get('/api/reports/calls/word', checkDatabaseConnection, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let filter = {};
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const calls = await Call.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(1000);

        const tableData = calls.map(call => [
            call.date.toLocaleString('ru-RU'),
            call.userId?.fio || call.userFio || 'Неизвестно',
            call.phone,
            call.number,
            call.callType === 'local' ? 'Местный' : 'Международный',
            `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`,
            `${call.cost.toFixed(2)} BYN`
        ]);

        const totalCost = calls.reduce((sum, call) => sum + call.cost, 0);
        const totalMinutes = calls.reduce((sum, call) => sum + call.duration, 0) / 60;
        const localCalls = calls.filter(c => c.callType === 'local').length;
        const internationalCalls = calls.filter(c => c.callType === 'international').length;

        const summary = {
            'Всего звонков': calls.length,
            'Местные звонки': localCalls,
            'Международные звонки': internationalCalls,
            'Общая длительность': `${totalMinutes.toFixed(2)} минут`,
            'Общая стоимость': `${totalCost.toFixed(2)} BYN`,
            'Средняя стоимость звонка': calls.length > 0 ? `${(totalCost / calls.length).toFixed(2)} BYN` : '0 BYN'
        };

        const reportData = {
            reportTitle: 'ОТЧЕТ ПО ВСЕМ ЗВОНКАМ',
            reportSubtitle: 'Мобильный оператор "BryTech"',
            period: startDate && endDate ? `${startDate} - ${endDate}` : 'За весь период',
            generationDate: new Date().toLocaleDateString('ru-RU'),
            totalRecords: calls.length,
            summary: summary,
            tableHeaders: ['Дата и время', 'Клиент', 'Телефон', 'Номер назначения', 'Тип', 'Длительность', 'Стоимость'],
            tableData: tableData
        };

        const htmlReport = createWordReport(reportData);

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="calls_report_${new Date().toISOString().split('T')[0]}.doc"`);

        res.send(Buffer.from(htmlReport));

    } catch (error) {
        console.error('❌ Ошибка формирования отчета по звонкам:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка формирования отчета' 
        });
    }
});

// Отчет по должникам в Word
app.get('/api/reports/debtors/word', checkDatabaseConnection, async (req, res) => {
    try {
        const debtors = await User.find({ 
            debt: { $gt: 0 } 
        }).select('fio phone balance debt tariff status registrationDate')
        .sort({ debt: -1 });

        const tableData = debtors.map(user => [
            user.fio,
            user.phone,
            `${user.balance.toFixed(2)} BYN`,
            `${user.debt.toFixed(2)} BYN`,
            user.tariff.name,
            user.status,
            user.registrationDate.toLocaleDateString('ru-RU')
        ]);

        const totalDebt = debtors.reduce((sum, user) => sum + user.debt, 0);
        const averageDebt = debtors.length > 0 ? totalDebt / debtors.length : 0;

        const summary = {
            'Всего должников': debtors.length,
            'Общая сумма долгов': `${totalDebt.toFixed(2)} BYN`,
            'Средний долг': `${averageDebt.toFixed(2)} BYN`,
            'Максимальный долг': debtors.length > 0 ? `${Math.max(...debtors.map(d => d.debt)).toFixed(2)} BYN` : '0 BYN',
            'Минимальный долг': debtors.length > 0 ? `${Math.min(...debtors.map(d => d.debt)).toFixed(2)} BYN` : '0 BYN'
        };

        const reportData = {
            reportTitle: 'ОТЧЕТ ПО ДОЛЖНИКАМ',
            reportSubtitle: 'Мобильный оператор "BryTech"',
            period: 'Актуально на текущую дату',
            generationDate: new Date().toLocaleDateString('ru-RU'),
            totalRecords: debtors.length,
            summary: summary,
            tableHeaders: ['ФИО', 'Телефон', 'Баланс', 'Задолженность', 'Тариф', 'Статус', 'Дата регистрации'],
            tableData: tableData
        };

        const htmlReport = createWordReport(reportData);

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="debtors_report_${new Date().toISOString().split('T')[0]}.doc"`);

        res.send(Buffer.from(htmlReport));

    } catch (error) {
        console.error('❌ Ошибка формирования отчета по должникам:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка формирования отчета' 
        });
    }
});

// Инициализация приложения
async function initializeApp() {
    try {
        await connectToDatabase();
        await checkAdmin();
        await createTestData();
        
        app.listen(PORT, () => {
            console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
            console.log(`📞 Мобильный оператор - Учет звонков`);
            console.log(`✅ Готов к работе`);
            console.log(`👤 Администратор: +375256082909 / 123123`);
            console.log(`📊 Доступны функции:`);
            console.log(`   - Добавление клиентов`);
            console.log(`   - Регистрация звонков`);
            console.log(`   - Управление балансом`);
            console.log(`   - Списание средств`);
            console.log(`   - Редактирование пользователей`);
            console.log(`   - Отчеты в Word формате`);
        });
    } catch (error) {
        console.error('❌ Ошибка инициализации приложения:', error);
        process.exit(1);
    }
}

// Запуск
initializeApp();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Завершение работы сервера...');
    await mongoose.connection.close();
    console.log('✅ MongoDB отключена');
    process.exit(0);
});