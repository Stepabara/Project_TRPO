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
        minutePrice: { type: Number, default: 0.10 }, // цена минуты сверх лимита в BYN
        internationalMinutePrice: { type: Number, default: 1.50 } // цена международной минуты в BYN
    },
    creditLimit: { type: Number, default: 50 }, // в BYN
    status: { type: String, default: 'active' },
    registrationDate: { type: Date, default: Date.now },
    debt: { type: Number, default: 0 }
});

// Схема звонков
const callSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
    type: { type: String, enum: ['topup', 'subscription', 'call_payment'], default: 'topup' }
});

const User = mongoose.model('User', userSchema);
const Call = mongoose.model('Call', callSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// Тарифы в белорусских рублях
const TARIFFS = {
    'standard': { 
        id: 'standard', 
        name: 'Стандарт', 
        price: 19.99, // BYN
        includedMinutes: 300,
        minutePrice: 0.10, // BYN за минуту сверх лимита
        internationalMinutePrice: 1.50, // BYN за международную минуту
        features: [
            '300 минут местных звонков', 
            'Местные звонки сверх лимита: 0.10 BYN/мин', 
            'Международные звонки: 1.50 BYN/мин',
            '15 ГБ интернета',
            '100 SMS сообщений'
        ]
    }
};

// Услуги в белорусских рублях
const SERVICES = [
    {
        id: 'antivirus',
        name: 'Антивирус',
        description: 'Защита устройства от вирусов и вредоносных программ',
        price: 2.99, // BYN
        category: 'безопасность'
    },
    {
        id: 'music',
        name: 'Музыка',
        description: 'Стриминг музыки без рекламы и ограничений',
        price: 4.99, // BYN
        category: 'развлечения'
    },
    {
        id: 'cloud',
        name: 'Облако',
        description: '50 ГБ облачного хранилища для файлов',
        price: 1.99, // BYN
        category: 'хранилище'
    },
    {
        id: 'tv',
        name: 'МТС TV',
        description: 'Доступ к 100+ телеканалам',
        price: 7.99, // BYN
        category: 'развлечения'
    },
    {
        id: 'games',
        name: 'Игровая подписка',
        description: 'Доступ к каталогу игр',
        price: 3.99, // BYN
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

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

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
                tariff: TARIFFS.standard
            });
            console.log('✅ Администратор создан');
        }
    } catch (error) {
        console.error('Ошибка создания администратора:', error);
    }
}

// Роуты
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
            balance: user.balance,
            creditLimit: user.creditLimit,
            status: user.status,
            tariff: user.tariff,
            registrationDate: user.registrationDate.toLocaleDateString('ru-RU'),
            debt: user.debt
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
        const { fio, phone, password } = req.body;

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

        const newUser = new User({
            fio,
            phone,
            password: hashedPassword,
            tariff: TARIFFS.standard
        });

        await newUser.save();

        const userData = {
            fio: newUser.fio,
            phone: newUser.phone,
            role: newUser.role,
            balance: newUser.balance,
            creditLimit: newUser.creditLimit,
            status: newUser.status,
            tariff: newUser.tariff,
            registrationDate: newUser.registrationDate.toLocaleDateString('ru-RU'),
            debt: newUser.debt
        };

        res.json({ 
            success: true, 
            message: 'Регистрация успешна!',
            redirect: '/client',
            user: userData
        });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка сервера' 
        });
    }
});

// Получение данных пользователя
app.get('/api/user/data', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ error: 'Не указан номер телефона' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({
            fio: user.fio,
            phone: user.phone,
            balance: user.balance,
            creditLimit: user.creditLimit,
            status: user.status,
            tariff: user.tariff,
            registrationDate: user.registrationDate.toLocaleDateString('ru-RU'),
            debt: user.debt
        });
    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
        res.status(500).json({ error: 'Ошибка получения данных' });
    }
});

// Получение данных использования
app.get('/api/user/usage', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
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
        
        const usageData = {
            internet: { 
                used: 8.5, 
                total: 15 
            },
            calls: { 
                used: localMinutes,
                total: user.tariff.includedMinutes,
                international: internationalMinutes,
                totalMinutes: totalMinutes
            },
            sms: { 
                used: 25, 
                total: 100 
            }
        };
        
        res.json(usageData);
    } catch (error) {
        console.error('Ошибка получения данных использования:', error);
        res.status(500).json({ error: 'Ошибка получения данных использования' });
    }
});

// Получение истории звонков
app.get('/api/user/calls', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, month } = req.query;
        
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
        
        res.json(callsHistory);
    } catch (error) {
        console.error('Ошибка получения истории звонков:', error);
        res.status(500).json({ error: 'Ошибка получения истории звонков' });
    }
});

// Регистрация нового звонка
app.post('/api/calls/register', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, number, duration, callType } = req.body;
        
        if (!phone || !number || !duration || !callType) {
            return res.status(400).json({ error: 'Не все поля заполнены' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Расчет стоимости звонка
        let cost = 0;
        if (callType === 'international') {
            cost = duration * user.tariff.internationalMinutePrice;
        } else {
            // Для местных звонков проверяем не превышен ли лимит
            const currentMonth = new Date().toISOString().slice(0, 7);
            const monthlyCalls = await Call.find({ 
                phone: user.phone,
                month: currentMonth,
                callType: 'local'
            });
            
            const usedMinutes = monthlyCalls.reduce((sum, call) => sum + call.duration, 0);
            const remainingMinutes = Math.max(0, user.tariff.includedMinutes - usedMinutes);
            
            if (duration <= remainingMinutes) {
                cost = 0; // Включено в абонентскую плату
            } else {
                const paidMinutes = duration - remainingMinutes;
                cost = paidMinutes * user.tariff.minutePrice;
            }
        }

        // Создаем запись о звонке
        const call = new Call({
            userId: user._id,
            phone: user.phone,
            callType,
            number,
            duration,
            cost,
            month: new Date().toISOString().slice(0, 7)
        });

        await call.save();

        // Списание стоимости звонка с баланса
        if (cost > 0) {
            user.balance -= cost;
            if (user.balance < 0) {
                user.debt = Math.abs(user.balance);
            }
            await user.save();
        }

        res.json({ 
            success: true, 
            message: 'Звонок зарегистрирован',
            call: {
                date: call.date.toLocaleString('ru-RU'),
                number: call.number,
                type: call.callType === 'local' ? 'Местный' : 'Международный',
                duration: `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`,
                cost: `${call.cost.toFixed(2)} BYN`
            }
        });

    } catch (error) {
        console.error('Ошибка регистрации звонка:', error);
        res.status(500).json({ error: 'Ошибка регистрации звонка' });
    }
});

// Получение истории платежей
app.get('/api/user/payments', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        const payments = await Payment.find({ phone })
            .sort({ date: -1 })
            .limit(50);
        
        const paymentsHistory = payments.map(payment => ({
            date: payment.date.toLocaleDateString('ru-RU'),
            amount: `${payment.amount.toFixed(2)} BYN`,
            method: payment.method,
            type: payment.type === 'topup' ? 'Пополнение' : 
                  payment.type === 'subscription' ? 'Абонентская плата' : 'Оплата звонков',
            status: 'Успешно'
        }));
        
        res.json(paymentsHistory);
    } catch (error) {
        console.error('Ошибка получения истории платежей:', error);
        res.status(500).json({ error: 'Ошибка получения истории платежей' });
    }
});

// ПОПОЛНЕНИЕ БАЛАНСА
app.post('/api/payment/topup', checkDatabaseConnection, async (req, res) => {
    try {
        console.log('🔄 Запрос на пополнение баланса:', req.body);
        
        const { phone, amount } = req.body;
        
        if (!phone || !amount || amount <= 0) {
            console.log('❌ Неверные данные:', { phone, amount });
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

        console.log(`💰 Пополнение баланса для ${phone} на сумму ${amountNumber} BYN`);

        const user = await User.findOne({ phone: phone });
        if (!user) {
            console.log('❌ Пользователь не найден:', phone);
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

        console.log('✅ Баланс успешно пополнен. Новый баланс:', user.balance);

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

// Получение услуг
app.get('/api/user/services', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        const userServices = SERVICES.map(service => ({
            ...service,
            active: Math.random() > 0.5,
            price: `${service.price} BYN`
        }));
        
        res.json(userServices);
    } catch (error) {
        console.error('Ошибка получения услуг:', error);
        res.status(500).json({ error: 'Ошибка получения услуг' });
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
        
        res.json(tariffs);
    } catch (error) {
        console.error('Ошибка получения тарифов:', error);
        res.status(500).json({ error: 'Ошибка получения тарифов' });
    }
});

// Получение информации о кредите
app.get('/api/user/credit-info', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ error: 'Не указан номер телефона' });
        }
        
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const availableCredit = Math.max(0, user.creditLimit + user.balance);
        const daysUntilPayment = Math.floor(Math.random() * 30) + 1;
        
        res.json({
            availableCredit: availableCredit,
            daysUntilPayment: daysUntilPayment
        });
    } catch (error) {
        console.error('Ошибка получения информации о кредите:', error);
        res.status(500).json({ error: 'Ошибка получения информации о кредите' });
    }
});

// Получение уведомлений
app.get('/api/user/notifications', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        const notifications = [
            {
                id: 1,
                type: 'info',
                title: 'Обновление тарифов',
                message: 'С 1 января вводятся новые тарифные планы',
                date: '2024-12-20',
                read: false
            },
            {
                id: 2,
                type: 'warning',
                title: 'Заканчивается пакет интернета',
                message: 'Осталось 0.5 ГБ из 15 ГБ',
                date: '2024-12-18',
                read: true
            }
        ];
        
        res.json(notifications);
    } catch (error) {
        console.error('Ошибка получения уведомлений:', error);
        res.status(500).json({ error: 'Ошибка получения уведомлений' });
    }
});

// Получение новостей
app.get('/api/news', checkDatabaseConnection, async (req, res) => {
    try {
        res.json(NEWS);
    } catch (error) {
        console.error('Ошибка получения новостей:', error);
        res.status(500).json({ error: 'Ошибка получения новостей' });
    }
});

// Обновление профиля
app.put('/api/user/settings', checkDatabaseConnection, async (req, res) => {
    try {
        const { fio, phone } = req.body;
        
        if (!fio || !phone) {
            return res.status(400).json({ error: 'Не заполнены обязательные поля' });
        }
        
        const user = await User.findOneAndUpdate(
            { phone },
            { fio: fio },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({ 
            success: true, 
            message: 'Настройки сохранены',
            user: {
                fio: user.fio,
                phone: user.phone,
                balance: user.balance,
                creditLimit: user.creditLimit,
                status: user.status,
                tariff: user.tariff
            }
        });
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        res.status(500).json({ error: 'Ошибка сохранения настроек' });
    }
});

// Отчет по звонкам за месяц
app.get('/api/reports/calls', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone, month } = req.query;
        
        if (!phone || !month) {
            return res.status(400).json({ error: 'Не указаны номер телефона и месяц' });
        }

        const calls = await Call.find({ phone, month })
            .sort({ date: 1 });

        const totalCost = calls.reduce((sum, call) => sum + call.cost, 0);
        const totalMinutes = calls.reduce((sum, call) => sum + call.duration, 0);
        const localCalls = calls.filter(call => call.callType === 'local');
        const internationalCalls = calls.filter(call => call.callType === 'international');

        const report = {
            month: month,
            totalCalls: calls.length,
            totalMinutes: totalMinutes,
            totalCost: totalCost.toFixed(2) + ' BYN',
            localCalls: {
                count: localCalls.length,
                minutes: localCalls.reduce((sum, call) => sum + call.duration, 0),
                cost: localCalls.reduce((sum, call) => sum + call.cost, 0).toFixed(2) + ' BYN'
            },
            internationalCalls: {
                count: internationalCalls.length,
                minutes: internationalCalls.reduce((sum, call) => sum + call.duration, 0),
                cost: internationalCalls.reduce((sum, call) => sum + call.cost, 0).toFixed(2) + ' BYN'
            },
            calls: calls.map(call => ({
                date: call.date.toLocaleString('ru-RU'),
                number: call.number,
                type: call.callType === 'local' ? 'Местный' : 'Международный',
                duration: call.duration,
                cost: call.cost.toFixed(2) + ' BYN'
            }))
        };

        res.json(report);
    } catch (error) {
        console.error('Ошибка формирования отчета по звонкам:', error);
        res.status(500).json({ error: 'Ошибка формирования отчета' });
    }
});

// Отчет по платежам
app.get('/api/reports/payments', checkDatabaseConnection, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let filter = {};
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const payments = await Payment.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 });

        const report = {
            period: startDate && endDate ? `${startDate} - ${endDate}` : 'Весь период',
            totalPayments: payments.length,
            totalAmount: payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2) + ' BYN',
            payments: payments.map(payment => ({
                date: payment.date.toLocaleDateString('ru-RU'),
                user: payment.userId.fio,
                phone: payment.userId.phone,
                amount: payment.amount.toFixed(2) + ' BYN',
                method: payment.method,
                type: payment.type === 'topup' ? 'Пополнение' : 
                      payment.type === 'subscription' ? 'Абонентская плата' : 'Оплата звонков'
            }))
        };

        res.json(report);
    } catch (error) {
        console.error('Ошибка формирования отчета по платежам:', error);
        res.status(500).json({ error: 'Ошибка формирования отчета' });
    }
});

// Отчет о должниках
app.get('/api/reports/debtors', checkDatabaseConnection, async (req, res) => {
    try {
        const debtors = await User.find({ 
            debt: { $gt: 0 } 
        }).select('fio phone balance debt tariff status');

        const report = {
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
        console.error('Ошибка формирования отчета о должниках:', error);
        res.status(500).json({ error: 'Ошибка формирования отчета' });
    }
});

// Проверка задолженности клиента
app.get('/api/user/debt', checkDatabaseConnection, async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ error: 'Не указан номер телефона' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({
            hasDebt: user.debt > 0,
            debtAmount: user.debt.toFixed(2) + ' BYN',
            balance: user.balance.toFixed(2) + ' BYN',
            creditLimit: user.creditLimit.toFixed(2) + ' BYN',
            availableCredit: Math.max(0, user.creditLimit + user.balance).toFixed(2) + ' BYN'
        });
    } catch (error) {
        console.error('Ошибка проверки задолженности:', error);
        res.status(500).json({ error: 'Ошибка проверки задолженности' });
    }
});

// Списание абонентской платы
app.post('/api/admin/charge-subscription', checkDatabaseConnection, async (req, res) => {
    try {
        const users = await User.find({ role: 'client' });
        
        const results = [];
        
        for (const user of users) {
            const oldBalance = user.balance;
            user.balance -= user.tariff.price;
            
            if (user.balance < 0) {
                user.debt = Math.abs(user.balance);
            }
            
            await user.save();
            
            const payment = new Payment({
                userId: user._id,
                phone: user.phone,
                amount: -user.tariff.price,
                method: 'Автосписание',
                type: 'subscription'
            });
            await payment.save();
            
            results.push({
                user: user.fio,
                phone: user.phone,
                amount: user.tariff.price.toFixed(2) + ' BYN',
                oldBalance: oldBalance.toFixed(2) + ' BYN',
                newBalance: user.balance.toFixed(2) + ' BYN',
                debt: user.debt.toFixed(2) + ' BYN'
            });
        }
        
        res.json({
            success: true,
            message: `Абонентская плата списана с ${results.length} пользователей`,
            results: results
        });
        
    } catch (error) {
        console.error('Ошибка списания абонентской платы:', error);
        res.status(500).json({ error: 'Ошибка списания абонентской платы' });
    }
});

// API для админ-панели
app.get('/api/admin/clients', checkDatabaseConnection, async (req, res) => {
    try {
        const clients = await User.find({ role: 'client' })
            .select('fio phone balance debt status tariff createdAt')
            .sort({ createdAt: -1 })
            .lean();
        
        const clientsWithFormattedData = clients.map(client => ({
            ...client,
            balance: client.balance.toFixed(2) + ' BYN',
            debt: client.debt.toFixed(2) + ' BYN',
            'tariff.price': client.tariff.price.toFixed(2) + ' BYN'
        }));
        
        res.json(clientsWithFormattedData);
    } catch (error) {
        console.error('Ошибка получения клиентов:', error);
        res.status(500).json({ error: 'Ошибка получения клиентов' });
    }
});

// Инициализация приложения
async function initializeApp() {
    try {
        await connectToDatabase();
        await checkAdmin();
        
        app.listen(PORT, () => {
            console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
            console.log(`📞 Мобильный оператор - Учет звонков`);
            console.log(`💰 Все цены в белорусских рублях (BYN)`);
            console.log(`✅ Готов к работе`);
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