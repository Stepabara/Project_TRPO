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

// Схема пользователя
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

// Схема платежей
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

// Схема услуг пользователя (ВОССТАНОВЛЕНО)
const userServiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, required: true },
    serviceId: { type: String, required: true },
    serviceName: { type: String, required: true },
    active: { type: Boolean, default: false },
    activationDate: { type: Date },
    deactivationDate: { type: Date }
});

const User = mongoose.model('User', userSchema);
const Call = mongoose.model('Call', callSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const UserService = mongoose.model('UserService', userServiceSchema); // ВОССТАНОВЛЕНО

// Тарифы в белорусских рублях (ВОССТАНОВЛЕНЫ features)
const TARIFFS = {
    'standard': { 
        id: 'standard', 
        name: 'Стандарт', 
        price: 19.99,
        includedMinutes: 300,
        internetGB: 15,
        smsCount: 100,
        minutePrice: 0.10,
        internationalMinutePrice: 1.50,
        features: [
            '300 минут местных звонков', 
            '15 ГБ интернета',
            '100 SMS сообщений',
            'Местные звонки сверх лимита: 0.10 BYN/мин', 
            'Международные звонки: 1.50 BYN/мин'
        ]
    },
    'plus+': { 
        id: 'plus+', 
        name: 'Плюс+', 
        price: 29.99,
        includedMinutes: 300,
        internetGB: 50,
        smsCount: 300,
        minutePrice: 0.15,
        internationalMinutePrice: 2.0,
        features: [
            '300 минут местных звонков', 
            '50 ГБ интернета',
            '300 SMS сообщений',
            'Местные звонки сверх лимита: 0.10 BYN/мин', 
            'Международные звонки: 2.0 BYN/мин'
        ]
    },
    'Super plus': { 
        id: 'Super plus', 
        name: 'Супер плюс', 
        price: 35.99,
        includedMinutes: 600,
        internetGB: 100,
        smsCount: 600,
        minutePrice: 0.20,
        internationalMinutePrice: 1.50,
        features: [
            '600 минут местных звонков', 
            '100 ГБ интернета',
            '600 SMS сообщений',
            'Местные звонки сверх лимита: 0.10 BYN/мин', 
            'Международные звонки: 1.50 BYN/мин'
        ]
    }
};

// Услуги в белорусских рублях (ВОССТАНОВЛЕНЫ)
const SERVICES = [
    {
        id: 'antivirus',
        name: 'Антивирус',
        description: 'Защита устройства от вирусов и вредоносных программ',
        price: 2.99,
        category: 'безопасность'
    },
    {
        id: 'music',
        name: 'Музыка',
        description: 'Стриминг музыки без рекламы и ограничений',
        price: 4.99,
        category: 'развлечения'
    },
    {
        id: 'cloud',
        name: 'Облако',
        description: '50 ГБ облачного хранилища для файлов',
        price: 1.99,
        category: 'хранилище'
    },
    {
        id: 'tv',
        name: 'МТС TV',
        description: 'Доступ к 100+ телеканалам',
        price: 7.99,
        category: 'развлечения'
    },
    {
        id: 'games',
        name: 'Игровая подписка',
        description: 'Доступ к каталогу игр',
        price: 3.99,
        category: 'развлечения'
    },
    {
        id: 'Мояк',
        name: 'Мояк',
        description: 'Моячек после звонка',
        price: 0,
        category: 'Звонок'
    }
];

// Новости (ВОССТАНОВЛЕНЫ)
const NEWS = [
    {
        id: 1,
        title: 'Новый тариф "Безлимитный"',
        date: '15 декабря 2024',
        content: 'Теперь доступен новый тариф с безлимитным интернетом и звонками по всей стране всего за 29.99 BYN/мес'
    },
    {
        id: 2,
        title: 'Бонус за пополнение',
        date: '10 декабря 2024',
        content: 'Пополните баланс на 20+ BYN и получите бонус 10% к следующему пополнению'
    },
    {
        id: 3,
        title: "Новая система реферальных бонусов",
        date: "15 декабря 2024",
        content: "Пригласите друга и получите 15 BYN на счет при его первой покупке от 50 BYN"
    },
    {
        id: 4,
        title: "Бонус за пополнение",
        date: "10 декабря 2024",
        content: "Пополните баланс на 20+ BYN и получите бонус 10% к следующему пополнению"
    },
    {
        id: 5,
        title: "Сезонная акция - Зимняя распродажа",
        date: "5 декабря 2024",
        content: "Скидка 25% на все услуги премиум-категории до конца декабря"
    },
    {
        id: 6,
        title: "Запуск мобильного приложения",
        date: "1 декабря 2024",
        content: "Теперь вы можете пользоваться нашим сервисом через новое мобильное приложение"
    },
    {
        id: 7,
        title: "Добавлены новые способы оплаты",
        date: "28 ноября 2024",
        content: "Теперь доступна оплата через криптовалюту и электронные кошельки"
    }
];

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

// Создание тестовых данных при запуске
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

        // Форматируем данные тарифа с features
        const tariffData = {
            id: user.tariff.id || 'standard',
            name: user.tariff.name || 'Стандарт',
            price: user.tariff.price || 19.99,
            includedMinutes: user.tariff.includedMinutes || 300,
            internetGB: user.tariff.internetGB || 15,
            smsCount: user.tariff.smsCount || 100,
            minutePrice: user.tariff.minutePrice || 0.10,
            internationalMinutePrice: user.tariff.internationalMinutePrice || 1.50,
            features: TARIFFS[user.tariff.id]?.features || [
                '300 минут местных звонков',
                '15 ГБ интернета',
                '100 SMS сообщений',
                'Местные звонки сверх лимита: 0.10 BYN/мин',
                'Международные звонки: 1.50 BYN/мин'
            ]
        };

        const userData = {
            fio: user.fio,
            phone: user.phone,
            role: user.role,
            balance: user.balance || 0,
            creditLimit: user.creditLimit || 50,
            status: user.status || 'active',
            tariff: tariffData,
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

// Регистрация
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

// ========== КЛИЕНТСКИЕ API (ВОССТАНОВЛЕНЫ) ==========

// Получение данных пользователя
app.get('/api/user/data', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указан номер телефона' 
            });
        }

        console.log(`📞 Запрос данных пользователя: ${phone}`);
        
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }
        
        // Форматируем данные тарифа с features
        const tariffData = {
            id: user.tariff.id || 'standard',
            name: user.tariff.name || 'Стандарт',
            price: user.tariff.price || 19.99,
            includedMinutes: user.tariff.includedMinutes || 300,
            internetGB: user.tariff.internetGB || 15,
            smsCount: user.tariff.smsCount || 100,
            minutePrice: user.tariff.minutePrice || 0.10,
            internationalMinutePrice: user.tariff.internationalMinutePrice || 1.50,
            features: TARIFFS[user.tariff.id]?.features || [
                '300 минут местных звонков',
                '15 ГБ интернета',
                '100 SMS сообщений',
                'Местные звонки сверх лимита: 0.10 BYN/мин',
                'Международные звонки: 1.50 BYN/мин'
            ]
        };
        
        const responseData = {
            success: true,
            fio: user.fio,
            phone: user.phone,
            balance: user.balance || 0,
            creditLimit: user.creditLimit || 50,
            status: user.status || 'active',
            tariff: tariffData,
            registrationDate: user.registrationDate.toLocaleDateString('ru-RU'),
            debt: user.debt || 0
        };

        console.log('✅ Данные пользователя отправлены');
        
        res.json(responseData);
    } catch (error) {
        console.error('❌ Ошибка получения данных пользователя:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения данных' 
        });
    }
});

// Получение данных использования
app.get('/api/user/usage', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указан номер телефона' 
            });
        }

        console.log(`📊 Запрос данных использования для: ${phone}`);
        
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }
        
        // Получаем статистику по звонкам за текущий месяц
        const currentMonth = new Date().toISOString().slice(0, 7);
        const calls = await Call.find({ 
            phone: user.phone,
            month: currentMonth 
        });
        
        const totalMinutes = calls.reduce((sum, call) => sum + call.duration, 0);
        const localMinutes = calls
            .filter(call => call.callType === 'local')
            .reduce((sum, call) => sum + call.duration, 0);
        const internationalMinutes = calls
            .filter(call => call.callType === 'international')
            .reduce((sum, call) => sum + call.duration, 0);
        
        // Генерируем реалистичные данные использования на основе тарифа
        const internetUsed = Math.min(
            Math.random() * user.tariff.internetGB * 0.8,
            user.tariff.internetGB - 0.5
        );
        
        const smsUsed = Math.min(
            Math.floor(Math.random() * user.tariff.smsCount * 0.6),
            user.tariff.smsCount - 5
        );
        
        const usageData = {
            success: true,
            internet: { 
                used: parseFloat(internetUsed.toFixed(1)),
                total: user.tariff.internetGB || 15
            },
            calls: { 
                used: localMinutes,
                total: user.tariff.includedMinutes || 300,
                international: internationalMinutes,
                totalMinutes: totalMinutes
            },
            sms: { 
                used: smsUsed,
                total: user.tariff.smsCount || 100
            }
        };
        
        console.log('✅ Данные использования отправлены');
        
        res.json(usageData);
    } catch (error) {
        console.error('❌ Ошибка получения данных использования:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения данных использования' 
        });
    }
});

// Получение истории звонков
app.get('/api/user/calls', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, month } = req.query;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указан номер телефона' 
            });
        }
        
        let filter = { phone };
        if (month) {
            filter.month = month;
        }
        
        const calls = await Call.find(filter)
            .sort({ date: -1 })
            .limit(50);
        
        const callsHistory = calls.map(call => ({
            date: call.date.toLocaleString('ru-RU'),
            number: call.number,
            type: call.callType === 'local' ? 'Местный' : 'Международный',
            duration: `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`,
            cost: `${call.cost.toFixed(2)} BYN`
        }));
        
        res.json({
            success: true,
            calls: callsHistory
        });
    } catch (error) {
        console.error('❌ Ошибка получения истории звонков:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории звонков' 
        });
    }
});

// Получение истории платежей
app.get('/api/user/payments', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указан номер телефона' 
            });
        }
        
        const payments = await Payment.find({ phone })
            .sort({ date: -1 })
            .limit(50);
        
        const paymentsHistory = payments.map(payment => ({
            date: payment.date.toLocaleDateString('ru-RU'),
            amount: `${payment.amount.toFixed(2)} BYN`,
            method: payment.method,
            type: payment.type === 'topup' ? 'Пополнение' : 
                  payment.type === 'subscription' ? 'Абонентская плата' : 
                  payment.type === 'tariff_change' ? 'Смена тарифа' : 'Оплата звонков',
            status: 'Успешно'
        }));
        
        res.json({
            success: true,
            payments: paymentsHistory
        });
    } catch (error) {
        console.error('❌ Ошибка получения истории платежей:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории платежей' 
        });
    }
});

// Получение услуг пользователя
app.get('/api/user/services', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указан номер телефона' 
            });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Получаем услуги пользователя из базы
        const userServices = await UserService.find({ phone });
        
        // Создаем массив всех услуг с информацией о статусе
        const servicesWithStatus = SERVICES.map(service => {
            const userService = userServices.find(us => us.serviceId === service.id);
            return {
                ...service,
                active: userService ? userService.active : false,
                price: `${service.price} BYN`,
                activationDate: userService ? userService.activationDate : null,
                deactivationDate: userService ? userService.deactivationDate : null
            };
        });

        res.json({
            success: true,
            services: servicesWithStatus
        });
    } catch (error) {
        console.error('❌ Ошибка получения услуг:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения услуг' 
        });
    }
});

// Подключение/отключение услуги
app.post('/api/user/services/toggle', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, serviceId, activate } = req.body;
        
        if (!phone || !serviceId || activate === undefined) {
            return res.status(400).json({ 
                success: false,
                error: 'Не все поля заполнены' 
            });
        }

        console.log(`🔄 Запрос изменения услуги: ${phone} -> ${serviceId}, активация: ${activate}`);
        
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Проверяем существование услуги
        const service = SERVICES.find(s => s.id === serviceId);
        if (!service) {
            return res.status(400).json({ 
                success: false,
                error: 'Указанная услуга не существует' 
            });
        }

        // Ищем существующую запись об услуге
        let userService = await UserService.findOne({ phone, serviceId });

        if (activate) {
            // Подключение услуги
            if (userService) {
                // Обновляем существующую запись
                userService.active = true;
                userService.activationDate = new Date();
                userService.deactivationDate = null;
            } else {
                // Создаем новую запись
                userService = new UserService({
                    userId: user._id,
                    phone: user.phone,
                    serviceId: service.id,
                    serviceName: service.name,
                    active: true,
                    activationDate: new Date()
                });
            }

            // Списание стоимости услуги с баланса (если услуга платная)
            if (service.price > 0) {
                if (user.balance < service.price) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Недостаточно средств на балансе для подключения услуги' 
                    });
                }
                user.balance -= service.price;
                await user.save();

                // Создаем запись о платеже
                const payment = new Payment({
                    userId: user._id,
                    phone: user.phone,
                    amount: -service.price,
                    method: 'Автосписание',
                    type: 'subscription'
                });
                await payment.save();
            }
        } else {
            // Отключение услуги
            if (userService) {
                userService.active = false;
                userService.deactivationDate = new Date();
            } else {
                return res.status(400).json({ 
                    success: false,
                    error: 'Услуга не была подключена' 
                });
            }
        }

        await userService.save();

        console.log(`✅ Услуга "${service.name}" ${activate ? 'подключена' : 'отключена'}`);

        res.json({ 
            success: true, 
            message: `Услуга "${service.name}" успешно ${activate ? 'подключена' : 'отключена'}`,
            service: {
                id: service.id,
                name: service.name,
                active: activate,
                activationDate: userService.activationDate,
                deactivationDate: userService.deactivationDate
            }
        });

    } catch (error) {
        console.error('❌ Ошибка изменения услуги:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка изменения услуги: ' + error.message 
        });
    }
});

// Получение доступных тарифов
app.get('/api/tariffs', checkDatabaseConnection, async (req, res) => {
    try {
        const tariffs = Object.values(TARIFFS).map(tariff => ({
            ...tariff,
            price: `${tariff.price} BYN`,
            minutePrice: `${tariff.minutePrice} BYN`,
            internationalMinutePrice: `${tariff.internationalMinutePrice} BYN`
        }));
        
        res.json({
            success: true,
            tariffs: tariffs
        });
    } catch (error) {
        console.error('❌ Ошибка получения тарифов:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения тарифов' 
        });
    }
});

// Смена тарифа пользователя
app.post('/api/user/tariff/change', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, tariffId } = req.body;
        
        if (!phone || !tariffId) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указаны номер телефона или ID тарифа' 
            });
        }

        console.log(`🔄 Запрос смены тарифа: ${phone} -> ${tariffId}`);
        
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        // Проверяем существование тарифа
        const newTariff = TARIFFS[tariffId];
        if (!newTariff) {
            return res.status(400).json({ 
                success: false,
                error: 'Указанный тариф не существует' 
            });
        }

        // Проверяем, не пытается ли пользователь сменить на тот же тариф
        if (user.tariff.id === tariffId) {
            return res.status(400).json({ 
                success: false,
                error: 'Вы уже используете этот тарифный план' 
            });
        }

        // Проверяем баланс пользователя
        const tariffPrice = newTariff.price;
        if (user.balance < tariffPrice) {
            return res.status(400).json({ 
                success: false,
                error: `Недостаточно средств на балансе. Стоимость тарифа: ${tariffPrice} BYN, ваш баланс: ${user.balance.toFixed(2)} BYN` 
            });
        }

        // Сохраняем старый тариф для информации
        const oldTariff = { ...user.tariff };

        // Обновляем тариф пользователя
        user.tariff = {
            id: newTariff.id,
            name: newTariff.name,
            price: newTariff.price,
            includedMinutes: newTariff.includedMinutes,
            internetGB: newTariff.internetGB,
            smsCount: newTariff.smsCount,
            minutePrice: newTariff.minutePrice,
            internationalMinutePrice: newTariff.internationalMinutePrice
        };

        // Списание стоимости тарифа с баланса
        user.balance -= tariffPrice;
        await user.save();

        // Создаем запись о платеже за смену тарифа
        const payment = new Payment({
            userId: user._id,
            phone: user.phone,
            amount: -tariffPrice,
            method: 'Автосписание',
            type: 'tariff_change',
            date: new Date()
        });
        await payment.save();

        console.log(`✅ Тариф успешно изменен: ${oldTariff.name} -> ${newTariff.name}`);
        console.log(`💰 Списано ${tariffPrice} BYN. Новый баланс: ${user.balance.toFixed(2)} BYN`);

        res.json({ 
            success: true, 
            message: `Тариф успешно изменен на "${newTariff.name}". С вашего счета списано ${tariffPrice} BYN`,
            newTariff: {
                ...user.tariff.toObject(),
                features: newTariff.features
            },
            oldTariff: oldTariff,
            amountCharged: tariffPrice,
            newBalance: user.balance
        });

    } catch (error) {
        console.error('❌ Ошибка смены тарифа:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка смены тарифа: ' + error.message 
        });
    }
});

// Получение новостей
app.get('/api/news', checkDatabaseConnection, async (req, res) => {
    try {
        res.json({
            success: true,
            news: NEWS
        });
    } catch (error) {
        console.error('❌ Ошибка получения новостей:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения новостей' 
        });
    }
});

// Обновление профиля
app.put('/api/user/settings', checkDatabaseConnection, async (req, res) => {
    try {
        const { fio, phone } = req.body;
        
        if (!fio || !phone) {
            return res.status(400).json({ 
                success: false,
                error: 'Не заполнены обязательные поля' 
            });
        }
        
        const user = await User.findOneAndUpdate(
            { phone },
            { fio: fio },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }
        
        // Форматируем обновленные данные тарифа
        const tariffData = {
            id: user.tariff.id || 'standard',
            name: user.tariff.name || 'Стандарт',
            price: user.tariff.price || 19.99,
            includedMinutes: user.tariff.includedMinutes || 300,
            internetGB: user.tariff.internetGB || 15,
            smsCount: user.tariff.smsCount || 100,
            minutePrice: user.tariff.minutePrice || 0.10,
            internationalMinutePrice: user.tariff.internationalMinutePrice || 1.50,
            features: TARIFFS[user.tariff.id]?.features || [
                '300 минут местных звонков',
                '15 ГБ интернета',
                '100 SMS сообщений',
                'Местные звонки сверх лимита: 0.10 BYN/мин',
                'Международные звонки: 1.50 BYN/мин'
            ]
        };
        
        res.json({ 
            success: true, 
            message: 'Настройки сохранены',
            user: {
                fio: user.fio,
                phone: user.phone,
                balance: user.balance,
                creditLimit: user.creditLimit,
                status: user.status,
                tariff: tariffData
            }
        });
    } catch (error) {
        console.error('❌ Ошибка сохранения настроек:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка сохранения настроек' 
        });
    }
});

// ========== АДМИНСКИЕ API (СОХРАНЕНЫ) ==========

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
app.put('/api/admin/user/settings', checkDatabaseConnection, async (req, res) => {
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
            Payment.deleteMany({ userId: id }),
            UserService.deleteMany({ userId: id })
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
            console.log(`   - Клиентский личный кабинет`);
            console.log(`   - Админ-панель`);
            console.log(`   - Управление тарифами и услугами`);
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