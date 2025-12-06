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

// ========== СХЕМЫ БАЗЫ ДАННЫХ ==========

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
        internetPricePerMB: { type: Number, default: 0.01 }, // Цена за 1 МБ сверх лимита
        smsPrice: { type: Number, default: 0.05 }, // Цена за SMS сверх лимита
        internationalMinutePrice: { type: Number, default: 1.50 }
    },
    creditLimit: { type: Number, default: 50 },
    status: { type: String, default: 'active' },
    registrationDate: { type: Date, default: Date.now },
    debt: { type: Number, default: 0 }
});

// Схема звонков (уже есть, оставляем)
const callSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userFio: { type: String, required: true },
    phone: { type: String, required: true },
    callType: { type: String, enum: ['local', 'international'], required: true },
    number: { type: String, required: true },
    duration: { type: Number, required: true }, // в секундах
    cost: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    month: { type: String, required: true } // Формат: YYYY-MM
});

// Схема интернет трафика (НОВАЯ)
const internetUsageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, required: true },
    date: { type: Date, default: Date.now },
    month: { type: String, required: true }, // Формат: YYYY-MM
    mbUsed: { type: Number, required: true, default: 0 }, // Использовано в МБ
    sessionDuration: { type: Number, default: 0 }, // Длительность сессии в секундах
    cost: { type: Number, default: 0 }, // Стоимость (если превышение)
    type: { type: String, enum: ['mobile', 'wifi'], default: 'mobile' }
});

// Схема SMS сообщений (НОВАЯ)
const smsUsageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, required: true },
    date: { type: Date, default: Date.now },
    month: { type: String, required: true }, // Формат: YYYY-MM
    recipientNumber: { type: String, required: true },
    messageLength: { type: Number, required: true }, // Длина сообщения в символах
    cost: { type: Number, default: 0 }, // Стоимость (если превышение)
    direction: { type: String, enum: ['outgoing', 'incoming'], default: 'outgoing' }
});

// Схема платежей (оставляем)
const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true },
    date: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['topup', 'subscription', 'call_payment', 'internet_payment', 'sms_payment', 'tariff_change', 'withdrawal'], 
        default: 'topup' 
    }
});

// Схема услуг пользователя
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
const InternetUsage = mongoose.model('InternetUsage', internetUsageSchema);
const SmsUsage = mongoose.model('SmsUsage', smsUsageSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const UserService = mongoose.model('UserService', userServiceSchema);

// ========== КОНФИГУРАЦИЯ ТАРИФОВ И УСЛУГ ==========

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
        internetPricePerMB: 0.01, // 0.01 BYN за 1 МБ сверх лимита
        smsPrice: 0.05, // 0.05 BYN за SMS сверх лимита
        internationalMinutePrice: 1.50,
        features: [
            '300 минут местных звонков', 
            '15 ГБ интернета',
            '100 SMS сообщений',
            'Местные звонки сверх лимита: 0.10 BYN/мин', 
            'Интернет сверх лимита: 0.01 BYN/МБ',
            'SMS сверх лимита: 0.05 BYN',
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
        internetPricePerMB: 0.008,
        smsPrice: 0.04,
        internationalMinutePrice: 2.0,
        features: [
            '300 минут местных звонков', 
            '50 ГБ интернета',
            '300 SMS сообщений',
            'Местные звонки сверх лимита: 0.15 BYN/мин', 
            'Интернет сверх лимита: 0.008 BYN/МБ',
            'SMS сверх лимита: 0.04 BYN',
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
        internetPricePerMB: 0.005,
        smsPrice: 0.03,
        internationalMinutePrice: 1.50,
        features: [
            '600 минут местных звонков', 
            '100 ГБ интернета',
            '600 SMS сообщений',
            'Местные звонки сверх лимита: 0.20 BYN/мин', 
            'Интернет сверх лимита: 0.005 BYN/МБ',
            'SMS сверх лимита: 0.03 BYN',
            'Международные звонки: 1.50 BYN/мин'
        ]
    }
};

// Услуги
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
    }
];

// Новости
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
    }
];

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

// ========== ФУНКЦИИ ИНИЦИАЛИЗАЦИИ ==========

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
                
                const currentMonth = new Date().toISOString().slice(0, 7);
                
                // Тестовые звонки
                const call = new Call({
                    userId: user._id,
                    userFio: user.fio,
                    phone: user.phone,
                    callType: 'local',
                    number: '+375291111111',
                    duration: Math.floor(Math.random() * 300) + 60,
                    cost: Math.random() * 2,
                    date: new Date(),
                    month: currentMonth
                });
                await call.save();
                
                // Тестовый интернет трафик
                const internetUsage = new InternetUsage({
                    userId: user._id,
                    phone: user.phone,
                    mbUsed: Math.floor(Math.random() * 5000) + 1000,
                    sessionDuration: Math.floor(Math.random() * 3600) + 600,
                    cost: Math.random() * 5,
                    type: 'mobile',
                    month: currentMonth
                });
                await internetUsage.save();
                
                // Тестовые SMS
                const smsUsage = new SmsUsage({
                    userId: user._id,
                    phone: user.phone,
                    recipientNumber: '+375291111111',
                    messageLength: Math.floor(Math.random() * 100) + 20,
                    cost: Math.random() * 0.5,
                    direction: 'outgoing',
                    month: currentMonth
                });
                await smsUsage.save();
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

// ========== АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ==========

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

        const tariffData = {
            id: user.tariff.id || 'standard',
            name: user.tariff.name || 'Стандарт',
            price: user.tariff.price || 19.99,
            includedMinutes: user.tariff.includedMinutes || 300,
            internetGB: user.tariff.internetGB || 15,
            smsCount: user.tariff.smsCount || 100,
            minutePrice: user.tariff.minutePrice || 0.10,
            internetPricePerMB: user.tariff.internetPricePerMB || 0.01,
            smsPrice: user.tariff.smsPrice || 0.05,
            internationalMinutePrice: user.tariff.internationalMinutePrice || 1.50,
            features: TARIFFS[user.tariff.id]?.features || TARIFFS.standard.features
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

// ========== КЛИЕНТСКИЕ API ==========

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

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }
        
        const tariffData = {
            id: user.tariff.id || 'standard',
            name: user.tariff.name || 'Стандарт',
            price: user.tariff.price || 19.99,
            includedMinutes: user.tariff.includedMinutes || 300,
            internetGB: user.tariff.internetGB || 15,
            smsCount: user.tariff.smsCount || 100,
            minutePrice: user.tariff.minutePrice || 0.10,
            internetPricePerMB: user.tariff.internetPricePerMB || 0.01,
            smsPrice: user.tariff.smsPrice || 0.05,
            internationalMinutePrice: user.tariff.internationalMinutePrice || 1.50,
            features: TARIFFS[user.tariff.id]?.features || TARIFFS.standard.features
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

        res.json(responseData);
    } catch (error) {
        console.error('❌ Ошибка получения данных пользователя:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения данных' 
        });
    }
});

// Получение данных использования (звонки, интернет, SMS)
app.get('/api/user/usage', checkDatabaseConnection, async (req, res) => {
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
        
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // Получаем статистику по звонкам
        const calls = await Call.find({ 
            phone: user.phone,
            month: currentMonth 
        });
        const totalCallMinutes = calls.reduce((sum, call) => sum + Math.floor(call.duration / 60), 0);
        const localCallMinutes = calls
            .filter(call => call.callType === 'local')
            .reduce((sum, call) => sum + Math.floor(call.duration / 60), 0);
        const internationalCallMinutes = calls
            .filter(call => call.callType === 'international')
            .reduce((sum, call) => sum + Math.floor(call.duration / 60), 0);
        
        // Получаем статистику по интернету
        const internetUsage = await InternetUsage.find({ 
            phone: user.phone,
            month: currentMonth 
        });
        const totalInternetMB = internetUsage.reduce((sum, usage) => sum + usage.mbUsed, 0);
        const totalInternetGB = totalInternetMB / 1024;
        
        // Получаем статистику по SMS
        const smsUsage = await SmsUsage.find({ 
            phone: user.phone,
            month: currentMonth 
        });
        const totalSMS = smsUsage.length;
        
        // Расчет превышений
        const internetLimitMB = (user.tariff.internetGB || 15) * 1024;
        const internetOverLimit = Math.max(0, totalInternetMB - internetLimitMB);
        const internetOverCost = internetOverLimit * (user.tariff.internetPricePerMB || 0.01);
        
        const callOverLimit = Math.max(0, localCallMinutes - (user.tariff.includedMinutes || 300));
        const callOverCost = callOverLimit * (user.tariff.minutePrice || 0.10);
        
        const smsOverLimit = Math.max(0, totalSMS - (user.tariff.smsCount || 100));
        const smsOverCost = smsOverLimit * (user.tariff.smsPrice || 0.05);
        
        const usageData = {
            success: true,
            internet: { 
                used: parseFloat(totalInternetGB.toFixed(2)),
                total: user.tariff.internetGB || 15,
                overLimit: parseFloat((internetOverLimit / 1024).toFixed(2)),
                overCost: parseFloat(internetOverCost.toFixed(2))
            },
            calls: { 
                used: localCallMinutes,
                total: user.tariff.includedMinutes || 300,
                international: internationalCallMinutes,
                totalMinutes: totalCallMinutes,
                overLimit: callOverLimit,
                overCost: parseFloat(callOverCost.toFixed(2))
            },
            sms: { 
                used: totalSMS,
                total: user.tariff.smsCount || 100,
                overLimit: smsOverLimit,
                overCost: parseFloat(smsOverCost.toFixed(2))
            },
            totalOverCost: parseFloat((internetOverCost + callOverCost + smsOverCost).toFixed(2))
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

// Регистрация использования интернета
app.post('/api/usage/internet', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, mbUsed, sessionDuration = 0, type = 'mobile' } = req.body;
        
        if (!phone || !mbUsed) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указаны телефон или объем трафика' 
            });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // Получаем использованный трафик за месяц
        const monthlyUsage = await InternetUsage.find({ 
            phone: user.phone,
            month: currentMonth 
        });
        const totalUsedMB = monthlyUsage.reduce((sum, usage) => sum + usage.mbUsed, 0) + parseFloat(mbUsed);
        
        // Проверяем лимит
        const internetLimitMB = (user.tariff.internetGB || 15) * 1024;
        let cost = 0;
        
        if (totalUsedMB > internetLimitMB) {
            // Расчет стоимости за превышение
            const overLimitMB = Math.max(0, totalUsedMB - internetLimitMB);
            cost = overLimitMB * (user.tariff.internetPricePerMB || 0.01);
            
            // Списание средств
            if (cost > 0) {
                user.balance -= cost;
                if (user.balance < 0) {
                    user.debt = Math.abs(user.balance);
                }
                await user.save();

                // Запись о платеже
                const payment = new Payment({
                    userId: user._id,
                    phone: user.phone,
                    amount: -cost,
                    method: 'Автосписание',
                    type: 'internet_payment',
                    date: new Date()
                });
                await payment.save();
            }
        }

        // Сохраняем использование
        const internetUsage = new InternetUsage({
            userId: user._id,
            phone: user.phone,
            mbUsed: parseFloat(mbUsed),
            sessionDuration: parseInt(sessionDuration),
            cost: cost,
            type: type,
            month: currentMonth
        });

        await internetUsage.save();

        res.json({ 
            success: true, 
            message: `Использование интернета зарегистрировано: ${mbUsed} МБ`,
            usage: {
                totalUsedMB: totalUsedMB,
                limitMB: internetLimitMB,
                overLimitMB: Math.max(0, totalUsedMB - internetLimitMB),
                cost: cost,
                newBalance: user.balance
            }
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации использования интернета:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка регистрации использования интернета' 
        });
    }
});

// Регистрация отправки SMS
app.post('/api/usage/sms', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, recipientNumber, messageLength, direction = 'outgoing' } = req.body;
        
        if (!phone || !recipientNumber || !messageLength) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указаны обязательные поля' 
            });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // Получаем количество отправленных SMS за месяц
        const monthlySMS = await SmsUsage.find({ 
            phone: user.phone,
            month: currentMonth,
            direction: 'outgoing'
        });
        const totalSMS = monthlySMS.length + 1;
        
        // Проверяем лимит
        const smsLimit = user.tariff.smsCount || 100;
        let cost = 0;
        
        if (totalSMS > smsLimit) {
            // Расчет стоимости за превышение
            cost = user.tariff.smsPrice || 0.05;
            
            // Списание средств
            if (cost > 0) {
                user.balance -= cost;
                if (user.balance < 0) {
                    user.debt = Math.abs(user.balance);
                }
                await user.save();

                // Запись о платеже
                const payment = new Payment({
                    userId: user._id,
                    phone: user.phone,
                    amount: -cost,
                    method: 'Автосписание',
                    type: 'sms_payment',
                    date: new Date()
                });
                await payment.save();
            }
        }

        // Сохраняем SMS
        const smsUsage = new SmsUsage({
            userId: user._id,
            phone: user.phone,
            recipientNumber: recipientNumber,
            messageLength: parseInt(messageLength),
            cost: cost,
            direction: direction,
            month: currentMonth
        });

        await smsUsage.save();

        res.json({ 
            success: true, 
            message: `SMS отправлено на номер ${recipientNumber}`,
            usage: {
                totalSMS: totalSMS,
                limitSMS: smsLimit,
                overLimitSMS: Math.max(0, totalSMS - smsLimit),
                cost: cost,
                newBalance: user.balance
            }
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации SMS:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка регистрации SMS' 
        });
    }
});

// Получение детальной истории использования
app.get('/api/user/usage/detailed', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, type, startDate, endDate, page = 1, limit = 20 } = req.query;
        
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

        let data = [];
        let total = 0;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Фильтр по дате
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        switch(type) {
            case 'calls':
                const callFilter = { phone: user.phone, ...dateFilter };
                total = await Call.countDocuments(callFilter);
                const calls = await Call.find(callFilter)
                    .sort({ date: -1 })
                    .skip(skip)
                    .limit(limitNum);
                
                data = calls.map(call => ({
                    type: 'call',
                    date: call.date.toLocaleString('ru-RU'),
                    details: `${call.callType === 'local' ? 'Местный' : 'Международный'} звонок`,
                    number: call.number,
                    duration: `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`,
                    cost: `${call.cost.toFixed(2)} BYN`
                }));
                break;

            case 'internet':
                const internetFilter = { phone: user.phone, ...dateFilter };
                total = await InternetUsage.countDocuments(internetFilter);
                const internet = await InternetUsage.find(internetFilter)
                    .sort({ date: -1 })
                    .skip(skip)
                    .limit(limitNum);
                
                data = internet.map(usage => ({
                    type: 'internet',
                    date: usage.date.toLocaleString('ru-RU'),
                    details: `Интернет трафик (${usage.type === 'mobile' ? 'мобильный' : 'Wi-Fi'})`,
                    volume: `${usage.mbUsed.toFixed(2)} МБ`,
                    duration: usage.sessionDuration > 0 ? 
                        `${Math.floor(usage.sessionDuration / 3600)}ч ${Math.floor((usage.sessionDuration % 3600) / 60)}м` : 
                        'Не указано',
                    cost: `${usage.cost.toFixed(2)} BYN`
                }));
                break;

            case 'sms':
                const smsFilter = { phone: user.phone, ...dateFilter };
                total = await SmsUsage.countDocuments(smsFilter);
                const sms = await SmsUsage.find(smsFilter)
                    .sort({ date: -1 })
                    .skip(skip)
                    .limit(limitNum);
                
                data = sms.map(usage => ({
                    type: 'sms',
                    date: usage.date.toLocaleString('ru-RU'),
                    details: `${usage.direction === 'outgoing' ? 'Исходящее' : 'Входящее'} SMS`,
                    recipient: usage.recipientNumber,
                    length: `${usage.messageLength} символов`,
                    cost: `${usage.cost.toFixed(2)} BYN`
                }));
                break;

            default:
                // Все типы
                const [callsAll, internetAll, smsAll] = await Promise.all([
                    Call.find({ phone: user.phone, ...dateFilter })
                        .sort({ date: -1 })
                        .skip(skip)
                        .limit(limitNum),
                    InternetUsage.find({ phone: user.phone, ...dateFilter })
                        .sort({ date: -1 })
                        .skip(skip)
                        .limit(limitNum),
                    SmsUsage.find({ phone: user.phone, ...dateFilter })
                        .sort({ date: -1 })
                        .skip(skip)
                        .limit(limitNum)
                ]);

                data = [
                    ...callsAll.map(call => ({
                        type: 'call',
                        date: call.date,
                        sortDate: call.date.getTime(),
                        details: `${call.callType === 'local' ? 'Местный' : 'Международный'} звонок`,
                        number: call.number,
                        duration: `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`,
                        cost: `${call.cost.toFixed(2)} BYN`
                    })),
                    ...internetAll.map(usage => ({
                        type: 'internet',
                        date: usage.date,
                        sortDate: usage.date.getTime(),
                        details: `Интернет трафик (${usage.type === 'mobile' ? 'мобильный' : 'Wi-Fi'})`,
                        volume: `${usage.mbUsed.toFixed(2)} МБ`,
                        duration: usage.sessionDuration > 0 ? 
                            `${Math.floor(usage.sessionDuration / 3600)}ч ${Math.floor((usage.sessionDuration % 3600) / 60)}м` : 
                            'Не указано',
                        cost: `${usage.cost.toFixed(2)} BYN`
                    })),
                    ...smsAll.map(usage => ({
                        type: 'sms',
                        date: usage.date,
                        sortDate: usage.date.getTime(),
                        details: `${usage.direction === 'outgoing' ? 'Исходящее' : 'Входящее'} SMS`,
                        recipient: usage.recipientNumber,
                        length: `${usage.messageLength} символов`,
                        cost: `${usage.cost.toFixed(2)} BYN`
                    }))
                ].sort((a, b) => b.sortDate - a.sortDate)
                 .slice(0, limitNum)
                 .map(item => {
                     const { sortDate, ...rest } = item;
                     rest.date = new Date(item.date).toLocaleString('ru-RU');
                     return rest;
                 });

                total = await Call.countDocuments({ phone: user.phone, ...dateFilter }) +
                       await InternetUsage.countDocuments({ phone: user.phone, ...dateFilter }) +
                       await SmsUsage.countDocuments({ phone: user.phone, ...dateFilter });
                break;
        }

        res.json({
            success: true,
            data: data,
            total: total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            type: type || 'all'
        });

    } catch (error) {
        console.error('❌ Ошибка получения детальной истории:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории использования' 
        });
    }
});

// ========== АДМИНСКИЕ API ДЛЯ УПРАВЛЕНИЯ ИСПОЛЬЗОВАНИЕМ ==========

// Получение статистики использования для админ-панели
app.get('/api/admin/usage/stats', checkDatabaseConnection, async (req, res) => {
    try {
        const { startDate, endDate, phone, tariff } = req.query;
        
        let userFilter = { role: 'client' };
        let usageFilter = {};
        
        if (phone) {
            userFilter.phone = { $regex: phone, $options: 'i' };
            usageFilter.phone = phone;
        }
        
        if (tariff) {
            userFilter['tariff.id'] = tariff;
        }
        
        // Фильтр по дате
        if (startDate && endDate) {
            usageFilter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const users = await User.find(userFilter).select('_id phone fio tariff');
        const userIds = users.map(u => u._id);
        
        usageFilter.userId = { $in: userIds };
        
        // Агрегация данных
        const [callsStats, internetStats, smsStats] = await Promise.all([
            Call.aggregate([
                { $match: usageFilter },
                { 
                    $group: {
                        _id: null,
                        totalCalls: { $sum: 1 },
                        totalDuration: { $sum: '$duration' },
                        totalCost: { $sum: '$cost' },
                        localCalls: { 
                            $sum: { $cond: [{ $eq: ['$callType', 'local'] }, 1, 0] }
                        },
                        internationalCalls: { 
                            $sum: { $cond: [{ $eq: ['$callType', 'international'] }, 1, 0] }
                        }
                    }
                }
            ]),
            InternetUsage.aggregate([
                { $match: usageFilter },
                { 
                    $group: {
                        _id: null,
                        totalSessions: { $sum: 1 },
                        totalMB: { $sum: '$mbUsed' },
                        totalCost: { $sum: '$cost' },
                        mobileSessions: { 
                            $sum: { $cond: [{ $eq: ['$type', 'mobile'] }, 1, 0] }
                        },
                        wifiSessions: { 
                            $sum: { $cond: [{ $eq: ['$type', 'wifi'] }, 1, 0] }
                        }
                    }
                }
            ]),
            SmsUsage.aggregate([
                { $match: usageFilter },
                { 
                    $group: {
                        _id: null,
                        totalSMS: { $sum: 1 },
                        totalCost: { $sum: '$cost' },
                        outgoingSMS: { 
                            $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] }
                        },
                        incomingSMS: { 
                            $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] }
                        }
                    }
                }
            ])
        ]);
        
        // Статистика по пользователям
        const userStats = await Promise.all(
            users.map(async (user) => {
                const [userCalls, userInternet, userSMS] = await Promise.all([
                    Call.countDocuments({ userId: user._id, ...usageFilter }),
                    InternetUsage.aggregate([
                        { $match: { userId: user._id, ...usageFilter } },
                        { $group: { _id: null, totalMB: { $sum: '$mbUsed' } } }
                    ]),
                    SmsUsage.countDocuments({ userId: user._id, ...usageFilter })
                ]);
                
                return {
                    fio: user.fio,
                    phone: user.phone,
                    tariff: user.tariff.name,
                    callsCount: userCalls,
                    internetMB: userInternet.length > 0 ? userInternet[0].totalMB : 0,
                    smsCount: userSMS
                };
            })
        );
        
        const result = {
            success: true,
            totals: {
                calls: {
                    total: callsStats[0]?.totalCalls || 0,
                    duration: callsStats[0]?.totalDuration || 0,
                    cost: callsStats[0]?.totalCost || 0,
                    local: callsStats[0]?.localCalls || 0,
                    international: callsStats[0]?.internationalCalls || 0
                },
                internet: {
                    sessions: internetStats[0]?.totalSessions || 0,
                    mb: internetStats[0]?.totalMB || 0,
                    gb: (internetStats[0]?.totalMB || 0) / 1024,
                    cost: internetStats[0]?.totalCost || 0,
                    mobile: internetStats[0]?.mobileSessions || 0,
                    wifi: internetStats[0]?.wifiSessions || 0
                },
                sms: {
                    total: smsStats[0]?.totalSMS || 0,
                    cost: smsStats[0]?.totalCost || 0,
                    outgoing: smsStats[0]?.outgoingSMS || 0,
                    incoming: smsStats[0]?.incomingSMS || 0
                }
            },
            users: userStats,
            totalUsers: users.length
        };
        
        res.json(result);
    } catch (error) {
        console.error('❌ Ошибка получения статистики использования:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения статистики' 
        });
    }
});

// Получение детальной истории использования для админ-панели
app.get('/api/admin/usage/detailed', checkDatabaseConnection, async (req, res) => {
    try {
        const { 
            type, 
            phone, 
            startDate, 
            endDate, 
            page = 1, 
            limit = 50,
            sortBy = 'date',
            sortOrder = 'desc'
        } = req.query;
        
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        let filter = {};
        let model;
        let projection;
        
        // Фильтр по телефону
        if (phone) {
            filter.phone = { $regex: phone, $options: 'i' };
        }
        
        // Фильтр по дате
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        switch(type) {
            case 'calls':
                model = Call;
                projection = 'userFio phone callType number duration cost date';
                break;
            case 'internet':
                model = InternetUsage;
                projection = 'phone mbUsed sessionDuration cost type date';
                break;
            case 'sms':
                model = SmsUsage;
                projection = 'phone recipientNumber messageLength cost direction date';
                break;
            default:
                // Для общего списка нужно будет делать отдельную логику
                return res.status(400).json({
                    success: false,
                    error: 'Укажите тип данных (calls, internet, sms)'
                });
        }
        
        const [data, total] = await Promise.all([
            model.find(filter)
                .select(projection)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            model.countDocuments(filter)
        ]);
        
        // Форматируем данные
        const formattedData = data.map(item => {
            const formatted = {
                _id: item._id,
                phone: item.phone,
                date: item.date.toLocaleString('ru-RU'),
                cost: `${item.cost.toFixed(2)} BYN`
            };
            
            if (type === 'calls') {
                formatted.userFio = item.userFio;
                formatted.type = item.callType === 'local' ? 'Местный' : 'Международный';
                formatted.number = item.number;
                formatted.duration = `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}`;
            } else if (type === 'internet') {
                formatted.volume = `${item.mbUsed.toFixed(2)} МБ`;
                formatted.type = item.type === 'mobile' ? 'Мобильный' : 'Wi-Fi';
                formatted.duration = item.sessionDuration > 0 ? 
                    `${Math.floor(item.sessionDuration / 3600)}ч ${Math.floor((item.sessionDuration % 3600) / 60)}м` : 
                    'Не указано';
            } else if (type === 'sms') {
                formatted.recipient = item.recipientNumber;
                formatted.direction = item.direction === 'outgoing' ? 'Исходящее' : 'Входящее';
                formatted.length = `${item.messageLength} символов`;
            }
            
            return formatted;
        });
        
        res.json({
            success: true,
            data: formattedData,
            total: total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            type: type
        });
    } catch (error) {
        console.error('❌ Ошибка получения детальной истории:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории' 
        });
    }
});

// Ручная регистрация использования (для админа)
app.post('/api/admin/usage/register', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, type, data } = req.body;
        
        if (!phone || !type || !data) {
            return res.status(400).json({ 
                success: false,
                error: 'Не указаны обязательные параметры' 
            });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        let result;
        const currentMonth = new Date().toISOString().slice(0, 7);

        switch(type) {
            case 'call':
                // Расчет стоимости звонка
                let callCost = 0;
                if (data.callType === 'international') {
                    callCost = data.duration * (user.tariff.internationalMinutePrice || 1.50);
                } else {
                    // Проверяем не превышен ли лимит
                    const monthlyCalls = await Call.find({ 
                        phone: user.phone,
                        month: currentMonth,
                        callType: 'local'
                    });
                    const totalLocalMinutes = monthlyCalls.reduce((sum, call) => sum + Math.floor(call.duration / 60), 0);
                    const remainingMinutes = Math.max(0, (user.tariff.includedMinutes || 300) - totalLocalMinutes);
                    
                    if (Math.floor(data.duration / 60) > remainingMinutes) {
                        // Расчет превышения
                        const overMinutes = Math.floor(data.duration / 60) - remainingMinutes;
                        callCost = overMinutes * (user.tariff.minutePrice || 0.10);
                    }
                }

                const call = new Call({
                    userId: user._id,
                    userFio: user.fio,
                    phone: user.phone,
                    callType: data.callType,
                    number: data.number,
                    duration: data.duration,
                    cost: callCost,
                    month: currentMonth
                });

                await call.save();

                if (callCost > 0) {
                    user.balance -= callCost;
                    if (user.balance < 0) {
                        user.debt = Math.abs(user.balance);
                    }
                    await user.save();

                    const payment = new Payment({
                        userId: user._id,
                        phone: user.phone,
                        amount: -callCost,
                        method: 'Административная регистрация',
                        type: 'call_payment',
                        date: new Date()
                    });
                    await payment.save();
                }

                result = {
                    type: 'call',
                    message: `Звонок зарегистрирован. Стоимость: ${callCost.toFixed(2)} BYN`,
                    data: call
                };
                break;

            case 'internet':
                // Расчет стоимости интернета
                const monthlyInternet = await InternetUsage.find({ 
                    phone: user.phone,
                    month: currentMonth 
                });
                const totalUsedMB = monthlyInternet.reduce((sum, usage) => sum + usage.mbUsed, 0) + parseFloat(data.mbUsed);
                const internetLimitMB = (user.tariff.internetGB || 15) * 1024;
                let internetCost = 0;

                if (totalUsedMB > internetLimitMB) {
                    const overLimitMB = Math.max(0, totalUsedMB - internetLimitMB);
                    internetCost = overLimitMB * (user.tariff.internetPricePerMB || 0.01);
                }

                const internetUsage = new InternetUsage({
                    userId: user._id,
                    phone: user.phone,
                    mbUsed: parseFloat(data.mbUsed),
                    sessionDuration: data.sessionDuration || 0,
                    cost: internetCost,
                    type: data.type || 'mobile',
                    month: currentMonth
                });

                await internetUsage.save();

                if (internetCost > 0) {
                    user.balance -= internetCost;
                    if (user.balance < 0) {
                        user.debt = Math.abs(user.balance);
                    }
                    await user.save();

                    const payment = new Payment({
                        userId: user._id,
                        phone: user.phone,
                        amount: -internetCost,
                        method: 'Административная регистрация',
                        type: 'internet_payment',
                        date: new Date()
                    });
                    await payment.save();
                }

                result = {
                    type: 'internet',
                    message: `Использование интернета зарегистрировано. Стоимость: ${internetCost.toFixed(2)} BYN`,
                    data: internetUsage
                };
                break;

            case 'sms':
                // Расчет стоимости SMS
                const monthlySMS = await SmsUsage.find({ 
                    phone: user.phone,
                    month: currentMonth,
                    direction: 'outgoing'
                });
                const totalSMS = monthlySMS.length + 1;
                const smsLimit = user.tariff.smsCount || 100;
                let smsCost = 0;

                if (totalSMS > smsLimit) {
                    smsCost = user.tariff.smsPrice || 0.05;
                }

                const smsUsage = new SmsUsage({
                    userId: user._id,
                    phone: user.phone,
                    recipientNumber: data.recipientNumber,
                    messageLength: data.messageLength,
                    cost: smsCost,
                    direction: data.direction || 'outgoing',
                    month: currentMonth
                });

                await smsUsage.save();

                if (smsCost > 0) {
                    user.balance -= smsCost;
                    if (user.balance < 0) {
                        user.debt = Math.abs(user.balance);
                    }
                    await user.save();

                    const payment = new Payment({
                        userId: user._id,
                        phone: user.phone,
                        amount: -smsCost,
                        method: 'Административная регистрация',
                        type: 'sms_payment',
                        date: new Date()
                    });
                    await payment.save();
                }

                result = {
                    type: 'sms',
                    message: `SMS зарегистрировано. Стоимость: ${smsCost.toFixed(2)} BYN`,
                    data: smsUsage
                };
                break;

            default:
                return res.status(400).json({ 
                    success: false,
                    error: 'Неизвестный тип использования' 
                });
        }

        res.json({
            success: true,
            ...result,
            newBalance: user.balance,
            debt: user.debt
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации использования:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка регистрации использования' 
        });
    }
});

// ========== ОСТАЛЬНЫЕ API (оставляем без изменений) ==========

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
                  payment.type === 'tariff_change' ? 'Смена тарифа' : 'Оплата услуг',
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

        const userServices = await UserService.find({ phone });
        
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

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        const service = SERVICES.find(s => s.id === serviceId);
        if (!service) {
            return res.status(400).json({ 
                success: false,
                error: 'Указанная услуга не существует' 
            });
        }

        let userService = await UserService.findOne({ phone, serviceId });

        if (activate) {
            if (userService) {
                userService.active = true;
                userService.activationDate = new Date();
                userService.deactivationDate = null;
            } else {
                userService = new UserService({
                    userId: user._id,
                    phone: user.phone,
                    serviceId: service.id,
                    serviceName: service.name,
                    active: true,
                    activationDate: new Date()
                });
            }

            if (service.price > 0) {
                if (user.balance < service.price) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Недостаточно средств на балансе для подключения услуги' 
                    });
                }
                user.balance -= service.price;
                await user.save();

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
            internetPricePerMB: `${tariff.internetPricePerMB} BYN`,
            smsPrice: `${tariff.smsPrice} BYN`,
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

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }

        const newTariff = TARIFFS[tariffId];
        if (!newTariff) {
            return res.status(400).json({ 
                success: false,
                error: 'Указанный тариф не существует' 
            });
        }

        if (user.tariff.id === tariffId) {
            return res.status(400).json({ 
                success: false,
                error: 'Вы уже используете этот тарифный план' 
            });
        }

        const tariffPrice = newTariff.price;
        if (user.balance < tariffPrice) {
            return res.status(400).json({ 
                success: false,
                error: `Недостаточно средств на балансе. Стоимость тарифа: ${tariffPrice} BYN, ваш баланс: ${user.balance.toFixed(2)} BYN` 
            });
        }

        const oldTariff = { ...user.tariff };

        user.tariff = {
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

        user.balance -= tariffPrice;
        await user.save();

        const payment = new Payment({
            userId: user._id,
            phone: user.phone,
            amount: -tariffPrice,
            method: 'Автосписание',
            type: 'tariff_change',
            date: new Date()
        });
        await payment.save();

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
        
        const tariffData = {
            id: user.tariff.id || 'standard',
            name: user.tariff.name || 'Стандарт',
            price: user.tariff.price || 19.99,
            includedMinutes: user.tariff.includedMinutes || 300,
            internetGB: user.tariff.internetGB || 15,
            smsCount: user.tariff.smsCount || 100,
            minutePrice: user.tariff.minutePrice || 0.10,
            internetPricePerMB: user.tariff.internetPricePerMB || 0.01,
            smsPrice: user.tariff.smsPrice || 0.05,
            internationalMinutePrice: user.tariff.internationalMinutePrice || 1.50,
            features: TARIFFS[user.tariff.id]?.features || TARIFFS.standard.features
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

        let cost = 0;
        if (callType === 'international') {
            cost = duration * (user.tariff.internationalMinutePrice || 1.50) / 60;
        } else {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const monthlyCalls = await Call.find({ 
                phone: user.phone,
                month: currentMonth,
                callType: 'local'
            });
            const totalLocalMinutes = monthlyCalls.reduce((sum, call) => sum + Math.floor(call.duration / 60), 0);
            const remainingMinutes = Math.max(0, (user.tariff.includedMinutes || 300) - totalLocalMinutes);
            
            if (Math.floor(duration / 60) > remainingMinutes) {
                const overMinutes = Math.floor(duration / 60) - remainingMinutes;
                cost = overMinutes * (user.tariff.minutePrice || 0.10);
            }
        }

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

        if (cost > 0) {
            user.balance -= cost;
            if (user.balance < 0) {
                user.debt = Math.abs(user.balance);
            }
            await user.save();

            const payment = new Payment({
                userId: user._id,
                phone: user.phone,
                amount: -cost,
                method: 'Автосписание',
                type: 'call_payment',
                date: new Date()
            });
            await payment.save();
        }

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

        user.balance += amountNumber;
        if (user.balance >= 0) {
            user.debt = 0;
        }
        await user.save();

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

        const availableBalance = user.balance + (user.creditLimit || 0);
        if (amountNumber > availableBalance) {
            return res.status(400).json({ 
                success: false,
                error: 'Недостаточно средств для списания' 
            });
        }

        const oldBalance = user.balance;
        user.balance -= amountNumber;
        
        if (user.balance < 0) {
            user.debt = Math.abs(user.balance);
        } else {
            user.debt = 0;
        }
        
        await user.save();

        const payment = new Payment({
            userId: user._id,
            phone: user.phone,
            amount: -amountNumber,
            method: 'Административное списание',
            type: 'withdrawal',
            date: new Date()
        });
        await payment.save();

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

        const updateData = {};
        if (fio) updateData.fio = fio;
        if (status) updateData.status = status;
        if (creditLimit !== undefined) updateData.creditLimit = parseFloat(creditLimit);

        await User.updateOne({ phone }, { $set: updateData });

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
        
        if (search) {
            filter.$or = [
                { fio: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status === 'debtor') {
            filter.debt = { $gt: 0 };
        } else if (status === 'active') {
            filter.balance = { $gte: 0 };
        }
        
        if (tariff) {
            filter['tariff.id'] = tariff;
        }
        
        const clients = await User.find(filter)
            .select('fio phone balance debt status tariff creditLimit registrationDate')
            .sort({ registrationDate: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
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

        if (phone) {
            filter.phone = { $regex: phone, $options: 'i' };
        }

        if (callType) {
            filter.callType = callType;
        }

        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const calls = await Call.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const totalCalls = await Call.countDocuments(filter);
        const totalLocalCalls = await Call.countDocuments({ ...filter, callType: 'local' });
        const totalInternationalCalls = await Call.countDocuments({ ...filter, callType: 'international' });
        
        const costAggregation = await Call.aggregate([
            { $match: filter },
            { $group: { _id: null, totalCost: { $sum: '$cost' } } }
        ]);
        const totalCost = costAggregation.length > 0 ? costAggregation[0].totalCost : 0;

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

// Получение истории интернета для админ-панели
app.get('/api/admin/internet', checkDatabaseConnection, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            phone, 
            type, 
            startDate, 
            endDate 
        } = req.query;

        let filter = {};

        if (phone) {
            filter.phone = { $regex: phone, $options: 'i' };
        }

        if (type) {
            filter.type = type;
        }

        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const internetUsage = await InternetUsage.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const totalUsage = await InternetUsage.countDocuments(filter);
        
        const statsAggregation = await InternetUsage.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalMB: { $sum: '$mbUsed' },
                    totalCost: { $sum: '$cost' },
                    mobileSessions: { 
                        $sum: { $cond: [{ $eq: ['$type', 'mobile'] }, 1, 0] }
                    },
                    wifiSessions: { 
                        $sum: { $cond: [{ $eq: ['$type', 'wifi'] }, 1, 0] }
                    }
                }
            }
        ]);

        const formattedUsage = internetUsage.map(usage => ({
            _id: usage._id,
            date: usage.date.toLocaleString('ru-RU'),
            userFio: usage.userId?.fio || 'Неизвестно',
            phone: usage.phone,
            volume: `${usage.mbUsed.toFixed(2)} МБ`,
            type: usage.type === 'mobile' ? 'Мобильный' : 'Wi-Fi',
            duration: usage.sessionDuration > 0 ? 
                `${Math.floor(usage.sessionDuration / 3600)}ч ${Math.floor((usage.sessionDuration % 3600) / 60)}м` : 
                'Не указано',
            cost: usage.cost
        }));

        res.json({
            success: true,
            data: formattedUsage,
            total: totalUsage,
            totalPages: Math.ceil(totalUsage / limitNum),
            currentPage: pageNum,
            stats: {
                totalMB: statsAggregation[0]?.totalMB || 0,
                totalGB: (statsAggregation[0]?.totalMB || 0) / 1024,
                totalCost: statsAggregation[0]?.totalCost || 0,
                mobileSessions: statsAggregation[0]?.mobileSessions || 0,
                wifiSessions: statsAggregation[0]?.wifiSessions || 0
            }
        });

    } catch (error) {
        console.error('❌ Ошибка получения истории интернета:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории интернета' 
        });
    }
});

// Получение истории SMS для админ-панели
app.get('/api/admin/sms', checkDatabaseConnection, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            phone, 
            direction, 
            startDate, 
            endDate 
        } = req.query;

        let filter = {};

        if (phone) {
            filter.phone = { $regex: phone, $options: 'i' };
        }

        if (direction) {
            filter.direction = direction;
        }

        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const smsUsage = await SmsUsage.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const totalSMS = await SmsUsage.countDocuments(filter);
        
        const statsAggregation = await SmsUsage.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalCost: { $sum: '$cost' },
                    outgoing: { 
                        $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] }
                    },
                    incoming: { 
                        $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] }
                    }
                }
            }
        ]);

        const formattedSMS = smsUsage.map(sms => ({
            _id: sms._id,
            date: sms.date.toLocaleString('ru-RU'),
            userFio: sms.userId?.fio || 'Неизвестно',
            phone: sms.phone,
            recipient: sms.recipientNumber,
            direction: sms.direction === 'outgoing' ? 'Исходящее' : 'Входящее',
            length: `${sms.messageLength} символов`,
            cost: sms.cost
        }));

        res.json({
            success: true,
            data: formattedSMS,
            total: totalSMS,
            totalPages: Math.ceil(totalSMS / limitNum),
            currentPage: pageNum,
            stats: {
                totalCost: statsAggregation[0]?.totalCost || 0,
                outgoing: statsAggregation[0]?.outgoing || 0,
                incoming: statsAggregation[0]?.incoming || 0
            }
        });

    } catch (error) {
        console.error('❌ Ошибка получения истории SMS:', error);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка получения истории SMS' 
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
                
                user.balance -= subscriptionAmount;
                
                if (user.balance < 0) {
                    user.debt = Math.abs(user.balance);
                }
                
                await user.save();
                
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
        
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Пользователь не найден' 
            });
        }
        
        if (user.role === 'admin') {
            return res.status(403).json({ 
                success: false,
                error: 'Нельзя удалить администратора' 
            });
        }
        
        await Promise.all([
            Call.deleteMany({ userId: id }),
            InternetUsage.deleteMany({ userId: id }),
            SmsUsage.deleteMany({ userId: id }),
            Payment.deleteMany({ userId: id }),
            UserService.deleteMany({ userId: id })
        ]);
        
        await User.findByIdAndDelete(id);
        
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
        
        // Статистика по использованию услуг
        const [callsStats, internetStats, smsStats] = await Promise.all([
            Call.aggregate([
                { 
                    $group: {
                        _id: null,
                        totalCalls: { $sum: 1 },
                        totalDuration: { $sum: '$duration' },
                        totalCost: { $sum: '$cost' }
                    }
                }
            ]),
            InternetUsage.aggregate([
                { 
                    $group: {
                        _id: null,
                        totalMB: { $sum: '$mbUsed' },
                        totalCost: { $sum: '$cost' }
                    }
                }
            ]),
            SmsUsage.aggregate([
                { 
                    $group: {
                        _id: null,
                        totalSMS: { $sum: 1 },
                        totalCost: { $sum: '$cost' }
                    }
                }
            ])
        ]);
        
        res.json({
            success: true,
            statistics: {
                totalClients,
                activeClients,
                debtors,
                totalDebt: totalDebt.toFixed(2),
                calls: {
                    total: callsStats[0]?.totalCalls || 0,
                    totalMinutes: callsStats[0] ? Math.floor(callsStats[0].totalDuration / 60) : 0,
                    totalCost: callsStats[0]?.totalCost || 0
                },
                internet: {
                    totalMB: internetStats[0]?.totalMB || 0,
                    totalGB: internetStats[0] ? (internetStats[0].totalMB / 1024).toFixed(2) : 0,
                    totalCost: internetStats[0]?.totalCost || 0
                },
                sms: {
                    total: smsStats[0]?.totalSMS || 0,
                    totalCost: smsStats[0]?.totalCost || 0
                }
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

// ========== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==========

async function initializeApp() {
    try {
        await connectToDatabase();
        await checkAdmin();
        await createTestData();
        
        app.listen(PORT, () => {
            console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
            console.log(`📞 Мобильный оператор - Учет звонков, интернета и SMS`);
            console.log(`✅ Готов к работе`);
            console.log(`👤 Администратор: +375256082909 / 123123`);
            console.log(`📊 Доступны функции:`);
            console.log(`   - Учет звонков, интернета и SMS`);
            console.log(`   - Тарификация за превышения`);
            console.log(`   - Детальная статистика использования`);
            console.log(`   - Админ-панель с фильтрацией`);
            console.log(`   - Клиентский личный кабинет`);
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