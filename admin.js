// Глобальные переменные
let allClients = [];
let currentEditingUser = null;
let currentCallsPage = 1;
let currentMessagesPage = 1;
const callsPerPage = 10;
const messagesPerPage = 10;

// Объект с описанием услуг
const servicesData = {
    'roaming': {
        name: 'Международный роуминг',
        price: 5,
        description: 'Возможность пользоваться связью за границей',
        category: 'связь'
    },
    'callerId': {
        name: 'Определитель номера',
        price: 2,
        description: 'Показывает номер входящего вызова',
        category: 'связь'
    },
    'antispam': {
        name: 'Антиспам',
        price: 3,
        description: 'Блокировка спам-звонков',
        category: 'защита'
    },
    'music': {
        name: 'Музыкальный сервис',
        price: 7,
        description: 'Безлимитная музыка без трафика',
        category: 'развлечения'
    },
    'games': {
        name: 'Игровая подписка',
        price: 10,
        description: 'Доступ к играм без трафика',
        category: 'развлечения'
    },
    'cloud': {
        name: 'Облачное хранилище',
        price: 4,
        description: '50 ГБ облачного хранилища',
        category: 'хранилище'
    },
    'news': {
        name: 'Новостная подписка',
        price: 1,
        description: 'Ежедневные новости по SMS',
        category: 'информация'
    },
    'weather': {
        name: 'Прогноз погоды',
        price: 1,
        description: 'Ежедневный прогноз погоды',
        category: 'информация'
    }
};

// ========== РЕАЛЬНЫЕ ФУНКЦИИ ДЛЯ PDF ОТЧЕТОВ ==========

// Полный отчет по пользователям с реальными данными
async function generateUsersPDF(doc, startDate, endDate, statusFilter, tariffFilter) {
    try {
        // Получаем данные пользователей
        let userFilter = { role: 'client' };
        
        if (statusFilter === 'debtor') {
            userFilter.debt = { $gt: 0 };
        } else if (statusFilter === 'active') {
            userFilter.balance = { $gte: 0 };
            userFilter.status = 'active';
        } else if (statusFilter === 'blocked') {
            userFilter.status = 'blocked';
        }
        
        if (tariffFilter) {
            userFilter['tariff.id'] = tariffFilter;
        }
        
        if (startDate && endDate) {
            userFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const users = await User.find(userFilter)
            .select('fio phone balance debt status tariff creditLimit createdAt')
            .sort({ createdAt: -1 })
            .lean();
        
        if (users.length === 0) {
            doc.fontSize(14)
               .fillColor('#dc3545')
               .text('Нет данных для отчета по заданным критериям', { align: 'center' });
            return;
        }
        
        // Статистика
        const stats = {
            total: users.length,
            totalBalance: users.reduce((sum, user) => sum + (user.balance || 0), 0),
            totalDebt: users.reduce((sum, user) => sum + (user.debt || 0), 0),
            active: users.filter(u => u.status === 'active').length,
            blocked: users.filter(u => u.status === 'blocked').length,
            averageBalance: users.length > 0 ? 
                users.reduce((sum, user) => sum + (user.balance || 0), 0) / users.length : 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ПОЛЬЗОВАТЕЛЯМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`)
           .text(`Статус: ${getStatusLabel(statusFilter || 'all')}`)
           .text(`Тариф: ${tariffFilter ? TARIFFS[tariffFilter]?.name || tariffFilter : 'Все'}`)
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОБЩАЯ СТАТИСТИКА', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего пользователей: ${stats.total}`)
           .text(`Активных: ${stats.active}`)
           .text(`Заблокированных: ${stats.blocked}`)
           .text(`Общий баланс: ${stats.totalBalance.toFixed(2)} BYN`)
           .text(`Общая задолженность: ${stats.totalDebt.toFixed(2)} BYN`)
           .text(`Средний баланс: ${stats.averageBalance.toFixed(2)} BYN`)
           .moveDown();
        
        // Распределение по тарифам
        const tariffStats = {};
        users.forEach(user => {
            const tariffName = user.tariff?.name || 'Не указан';
            tariffStats[tariffName] = (tariffStats[tariffName] || 0) + 1;
        });
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('РАСПРЕДЕЛЕНИЕ ПО ТАРИФАМ', { underline: true })
           .moveDown(0.5);
        
        Object.keys(tariffStats).forEach(tariff => {
            const count = tariffStats[tariff];
            const percentage = ((count / stats.total) * 100).toFixed(1);
            doc.fontSize(10)
               .text(`${tariff}: ${count} пользователей (${percentage}%)`);
        });
        
        doc.moveDown();
        
        // Таблица пользователей
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК ПОЛЬЗОВАТЕЛЕЙ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [30, 120, 80, 60, 60, 60, 50];
        const headers = ['№', 'ФИО', 'Телефон', 'Баланс', 'Долг', 'Тариф', 'Статус'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        users.forEach((user, index) => {
            // Новая страница если не хватает места
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                // Повторяем заголовки на новой странице
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            // Чередование цветов строк
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 460, 20)
                   .fill('#f8f9fa');
            }
            
            const rowData = [
                (index + 1).toString(),
                user.fio || '-',
                user.phone || '-',
                `${(user.balance || 0).toFixed(2)} BYN`,
                `${(user.debt || 0).toFixed(2)} BYN`,
                user.tariff?.name || 'Стандарт',
                getStatusLabel(user.status || 'active')
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                // Цвет для отрицательных балансов и долгов
                if ((i === 3 && (user.balance || 0) < 0) || (i === 4 && (user.debt || 0) > 0)) {
                    doc.fillColor('#dc3545');
                } else if (i === 3 && (user.balance || 0) >= 0) {
                    doc.fillColor('#28a745');
                } else {
                    doc.fillColor('#333');
                }
                
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по пользователям:', error);
        throw error;
    }
}

// Отчет по звонкам с реальными данными
async function generateCallsPDF(doc, startDate, endDate, phoneFilter, callTypeFilter) {
    try {
        // Фильтрация звонков
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (callTypeFilter) {
            filter.callType = callTypeFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const calls = await Call.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Агрегация для статистики
        const statsAggregation = await Call.aggregate([
            { $match: filter },
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
        ]);
        
        const stats = statsAggregation[0] || {
            totalCalls: 0,
            totalDuration: 0,
            totalCost: 0,
            localCalls: 0,
            internationalCalls: 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ЗВОНКАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (callTypeFilter) doc.text(`Тип звонков: ${callTypeFilter === 'local' ? 'Местные' : 'Международные'}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('СТАТИСТИКА ЗВОНКОВ', { underline: true })
           .moveDown(0.5);
        
        const totalHours = Math.floor(stats.totalDuration / 3600);
        const totalMinutes = Math.floor((stats.totalDuration % 3600) / 60);
        const totalSeconds = stats.totalDuration % 60;
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего звонков: ${stats.totalCalls}`)
           .text(`Общая длительность: ${totalHours}ч ${totalMinutes}м ${totalSeconds}с`)
           .text(`Общая стоимость: ${stats.totalCost.toFixed(2)} BYN`)
           .text(`Местные звонки: ${stats.localCalls} (${stats.totalCalls > 0 ? ((stats.localCalls / stats.totalCalls) * 100).toFixed(1) : 0}%)`)
           .text(`Международные звонки: ${stats.internationalCalls} (${stats.totalCalls > 0 ? ((stats.internationalCalls / stats.totalCalls) * 100).toFixed(1) : 0}%)`)
           .text(`Средняя стоимость звонка: ${stats.totalCalls > 0 ? (stats.totalCost / stats.totalCalls).toFixed(2) : 0} BYN`)
           .moveDown();
        
        if (calls.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о звонках за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица звонков
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК ЗВОНКОВ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 80, 50, 60, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Номер', 'Тип', 'Длительность', 'Стоимость'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        calls.forEach((call, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                // Заголовки на новой странице
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            // Чередование цветов
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 510, 20)
                   .fill('#f8f9fa');
            }
            
            const duration = call.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            
            const rowData = [
                call.date ? new Date(call.date).toLocaleString('ru-RU') : '-',
                call.userId?.fio || call.userFio || '-',
                call.phone || '-',
                call.number || '-',
                call.callType === 'local' ? 'Местный' : 'Международный',
                `${minutes}:${seconds.toString().padStart(2, '0')}`,
                `${(call.cost || 0).toFixed(2)} BYN`
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по звонкам:', error);
        throw error;
    }
}

// Отчет по интернет трафику
async function generateInternetPDF(doc, startDate, endDate, phoneFilter, typeFilter) {
    try {
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (typeFilter) {
            filter.type = typeFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const internetData = await InternetUsage.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Статистика
        const statsAggregation = await InternetUsage.aggregate([
            { $match: filter },
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
        ]);
        
        const stats = statsAggregation[0] || {
            totalSessions: 0,
            totalMB: 0,
            totalCost: 0,
            mobileSessions: 0,
            wifiSessions: 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ИНТЕРНЕТ ТРАФИКУ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (typeFilter) doc.text(`Тип подключения: ${typeFilter === 'mobile' ? 'Мобильный' : 'Wi-Fi'}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('СТАТИСТИКА ТРАФИКА', { underline: true })
           .moveDown(0.5);
        
        const totalGB = stats.totalMB / 1024;
        const avgSessionMB = stats.totalSessions > 0 ? stats.totalMB / stats.totalSessions : 0;
        const avgSessionCost = stats.totalSessions > 0 ? stats.totalCost / stats.totalSessions : 0;
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего сессий: ${stats.totalSessions}`)
           .text(`Общий трафик: ${stats.totalMB.toFixed(2)} МБ (${totalGB.toFixed(2)} ГБ)`)
           .text(`Общая стоимость: ${stats.totalCost.toFixed(2)} BYN`)
           .text(`Мобильный трафик: ${stats.mobileSessions} сессий (${stats.totalSessions > 0 ? ((stats.mobileSessions / stats.totalSessions) * 100).toFixed(1) : 0}%)`)
           .text(`Wi-Fi трафик: ${stats.wifiSessions} сессий (${stats.totalSessions > 0 ? ((stats.wifiSessions / stats.totalSessions) * 100).toFixed(1) : 0}%)`)
           .text(`Средняя сессия: ${avgSessionMB.toFixed(2)} МБ за ${avgSessionCost.toFixed(2)} BYN`)
           .moveDown();
        
        if (internetData.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о трафике за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица данных
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК СЕССИЙ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 60, 60, 80, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Трафик (МБ)', 'Тип', 'Длительность', 'Стоимость'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        internetData.forEach((session, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 520, 20)
                   .fill('#f8f9fa');
            }
            
            const duration = session.sessionDuration || 0;
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const durationText = duration > 0 ? `${hours}ч ${minutes}м` : '-';
            
            const rowData = [
                session.date ? new Date(session.date).toLocaleString('ru-RU') : '-',
                session.userId?.fio || '-',
                session.phone || '-',
                (session.mbUsed || 0).toFixed(2),
                session.type === 'mobile' ? 'Мобильный' : 'Wi-Fi',
                durationText,
                `${(session.cost || 0).toFixed(2)} BYN`
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по трафику:', error);
        throw error;
    }
}

// Отчет по SMS
async function generateSMSPDF(doc, startDate, endDate, phoneFilter, directionFilter) {
    try {
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (directionFilter) {
            filter.direction = directionFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const smsData = await SmsUsage.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Статистика
        const statsAggregation = await SmsUsage.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalSMS: { $sum: 1 },
                    totalCost: { $sum: '$cost' },
                    totalChars: { $sum: '$messageLength' },
                    outgoing: { 
                        $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] }
                    },
                    incoming: { 
                        $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] }
                    }
                }
            }
        ]);
        
        const stats = statsAggregation[0] || {
            totalSMS: 0,
            totalCost: 0,
            totalChars: 0,
            outgoing: 0,
            incoming: 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО SMS СООБЩЕНИЯМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (directionFilter) doc.text(`Направление: ${directionFilter === 'outgoing' ? 'Исходящие' : 'Входящие'}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('СТАТИСТИКА SMS', { underline: true })
           .moveDown(0.5);
        
        const avgChars = stats.totalSMS > 0 ? stats.totalChars / stats.totalSMS : 0;
        const avgCost = stats.totalSMS > 0 ? stats.totalCost / stats.totalSMS : 0;
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего SMS: ${stats.totalSMS}`)
           .text(`Общая стоимость: ${stats.totalCost.toFixed(2)} BYN`)
           .text(`Всего символов: ${stats.totalChars}`)
           .text(`Исходящие SMS: ${stats.outgoing} (${stats.totalSMS > 0 ? ((stats.outgoing / stats.totalSMS) * 100).toFixed(1) : 0}%)`)
           .text(`Входящие SMS: ${stats.incoming} (${stats.totalSMS > 0 ? ((stats.incoming / stats.totalSMS) * 100).toFixed(1) : 0}%)`)
           .text(`Средняя длина: ${avgChars.toFixed(0)} символов`)
           .text(`Средняя стоимость: ${avgCost.toFixed(2)} BYN`)
           .moveDown();
        
        if (smsData.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о SMS за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица данных
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК SMS', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 80, 80, 60, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Получатель', 'Направление', 'Длина', 'Стоимость'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        smsData.forEach((sms, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 540, 20)
                   .fill('#f8f9fa');
            }
            
            const rowData = [
                sms.date ? new Date(sms.date).toLocaleString('ru-RU') : '-',
                sms.userId?.fio || '-',
                sms.phone || '-',
                sms.recipientNumber || '-',
                sms.direction === 'outgoing' ? 'Исходящее' : 'Входящее',
                `${sms.messageLength || 0} симв.`,
                `${(sms.cost || 0).toFixed(2)} BYN`
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по SMS:', error);
        throw error;
    }
}

// Отчет по платежам
async function generatePaymentsPDF(doc, startDate, endDate, phoneFilter, typeFilter) {
    try {
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (typeFilter) {
            filter.type = typeFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const payments = await Payment.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Статистика
        const statsAggregation = await Payment.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalPayments: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalIncome: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
                    totalExpense: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } }
                }
            }
        ]);
        
        const stats = statsAggregation[0] || {
            totalPayments: 0,
            totalAmount: 0,
            totalIncome: 0,
            totalExpense: 0
        };
        
        // Распределение по типам
        const typeStats = await Payment.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                }
            }
        ]);
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ПЛАТЕЖАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (typeFilter) doc.text(`Тип платежа: ${getPaymentTypeLabel(typeFilter)}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ФИНАНСОВАЯ СТАТИСТИКА', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего платежей: ${stats.totalPayments}`)
           .text(`Общая сумма операций: ${stats.totalAmount.toFixed(2)} BYN`)
           .text(`Общий доход (пополнения): ${stats.totalIncome.toFixed(2)} BYN`)
           .text(`Общие расходы (списания): ${Math.abs(stats.totalExpense).toFixed(2)} BYN`)
           .text(`Чистый доход: ${(stats.totalIncome + stats.totalExpense).toFixed(2)} BYN`)
           .moveDown();
        
        // Распределение по типам
        if (typeStats.length > 0) {
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#1976d2')
               .text('РАСПРЕДЕЛЕНИЕ ПО ТИПАМ ПЛАТЕЖЕЙ', { underline: true })
               .moveDown(0.5);
            
            typeStats.forEach(typeStat => {
                const percentage = (typeStat.count / stats.totalPayments * 100).toFixed(1);
                doc.fontSize(10)
                   .text(`${getPaymentTypeLabel(typeStat._id)}: ${typeStat.count} платежей (${percentage}%), сумма: ${typeStat.amount.toFixed(2)} BYN`);
            });
            
            doc.moveDown();
        }
        
        if (payments.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о платежах за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица платежей
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК ПЛАТЕЖЕЙ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 60, 80, 70, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Сумма', 'Тип', 'Метод', 'Статус'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        payments.forEach((payment, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 530, 20)
                   .fill('#f8f9fa');
            }
            
            const amountColor = payment.amount > 0 ? '#28a745' : '#dc3545';
            const amountSign = payment.amount > 0 ? '+' : '';
            
            const rowData = [
                payment.date ? new Date(payment.date).toLocaleString('ru-RU') : '-',
                payment.userId?.fio || '-',
                payment.phone || '-',
                `${amountSign}${(payment.amount || 0).toFixed(2)} BYN`,
                getPaymentTypeLabel(payment.type),
                payment.method || '-',
                'Успешно'
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                if (i === 3) {
                    doc.fillColor(amountColor);
                } else {
                    doc.fillColor('#333');
                }
                
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                
                doc.fillColor('#333');
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по платежам:', error);
        throw error;
    }
}

// Отчет по должникам
async function generateDebtorsPDF(doc, startDate, endDate) {
    try {
        let filter = { 
            debt: { $gt: 0 },
            role: 'client'
        };
        
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const debtors = await User.find(filter)
            .select('fio phone balance debt tariff status createdAt')
            .sort({ debt: -1 })
            .lean();
        
        // Статистика
        const statsAggregation = await User.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalDebtors: { $sum: 1 },
                    totalDebt: { $sum: '$debt' },
                    avgDebt: { $avg: '$debt' },
                    maxDebt: { $max: '$debt' },
                    minDebt: { $min: '$debt' }
                }
            }
        ]);
        
        const stats = statsAggregation[0] || {
            totalDebtors: 0,
            totalDebt: 0,
            avgDebt: 0,
            maxDebt: 0,
            minDebt: 0
        };
        
        // Группировка по сумме долга
        const debtGroups = {
            small: debtors.filter(d => (d.debt || 0) <= 50).length,
            medium: debtors.filter(d => (d.debt || 0) > 50 && (d.debt || 0) <= 200).length,
            large: debtors.filter(d => (d.debt || 0) > 200).length
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('ОТЧЕТ ПО ДОЛЖНИКАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`)
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Важное предупреждение
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('ВНИМАНИЕ! СРОЧНОЕ ИСПОЛНЕНИЕ', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text('Следующие пользователи имеют задолженность по оплате услуг связи.')
           .text('Рекомендуется предпринять меры для взыскания задолженности.')
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('СТАТИСТИКА ЗАДОЛЖЕННОСТИ', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего должников: ${stats.totalDebtors}`)
           .text(`Общая сумма долга: ${stats.totalDebt.toFixed(2)} BYN`)
           .text(`Средний долг: ${stats.avgDebt.toFixed(2)} BYN`)
           .text(`Максимальный долг: ${stats.maxDebt.toFixed(2)} BYN`)
           .text(`Минимальный долг: ${stats.minDebt.toFixed(2)} BYN`)
           .moveDown();
        
        // Группировка по сумме
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('ГРУППИРОВКА ПО СУММЕ ДОЛГА', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .text(`Малые долги (до 50 BYN): ${debtGroups.small} чел. (${stats.totalDebtors > 0 ? ((debtGroups.small / stats.totalDebtors) * 100).toFixed(1) : 0}%)`)
           .text(`Средние долги (50-200 BYN): ${debtGroups.medium} чел. (${stats.totalDebtors > 0 ? ((debtGroups.medium / stats.totalDebtors) * 100).toFixed(1) : 0}%)`)
           .text(`Крупные долги (более 200 BYN): ${debtGroups.large} чел. (${stats.totalDebtors > 0 ? ((debtGroups.large / stats.totalDebtors) * 100).toFixed(1) : 0}%)`)
           .moveDown();
        
        if (debtors.length === 0) {
            doc.fontSize(14)
               .fillColor('#28a745')
               .text('Должников не обнаружено!', { align: 'center' });
            return;
        }
        
        // Таблица должников
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('СПИСОК ДОЛЖНИКОВ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [30, 120, 80, 60, 70, 60, 70];
        const headers = ['№', 'ФИО', 'Телефон', 'Баланс', 'Долг', 'Тариф', 'Статус'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#dc3545');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        debtors.forEach((debtor, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#dc3545');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 490, 20)
                   .fill('#fdf2f2');
            }
            
            const rowData = [
                (index + 1).toString(),
                debtor.fio || '-',
                debtor.phone || '-',
                `${(debtor.balance || 0).toFixed(2)} BYN`,
                `${(debtor.debt || 0).toFixed(2)} BYN`,
                debtor.tariff?.name || 'Стандарт',
                getStatusLabel(debtor.status || 'active')
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                // Красный цвет для долгов и отрицательных балансов
                if ((i === 3 && (debtor.balance || 0) < 0) || i === 4) {
                    doc.fillColor('#dc3545');
                } else {
                    doc.fillColor('#333');
                }
                
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                
                doc.fillColor('#333');
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
        // Рекомендации
        doc.moveDown(2);
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('РЕКОМЕНДАЦИИ:', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text('1. Связаться с должниками для уточнения причин задолженности')
           .text('2. Предложить варианты реструктуризации долга')
           .text('3. Применить штрафные санкции согласно договору')
           .text('4. Рассмотреть возможность ограничения услуг')
           .text('5. Передать данные о злостных должниках в коллекторские агентства');
        
    } catch (error) {
        console.error('Ошибка генерации отчета по должникам:', error);
        throw error;
    }
}

// Полный отчет (все данные)
async function generateFullPDF(doc, startDate, endDate) {
    try {
        // Обложка
        doc.fontSize(28)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ПОЛНЫЙ ОТЧЕТ', 0, 150, { align: 'center' });
        
        doc.fontSize(18)
           .font('Helvetica')
           .fillColor('#666')
           .text('Мобильный оператор', 0, 200, { align: 'center' });
        
        doc.fontSize(14)
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'}`, 0, 250, { align: 'center' })
           .text(`${endDate ? formatDate(endDate) : 'Текущая дата'}`, 0, 270, { align: 'center' });
        
        doc.fontSize(12)
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, 0, 300, { align: 'center' })
           .text(`${new Date().toLocaleTimeString('ru-RU')}`, 0, 315, { align: 'center' });
        
        // 1. Отчет по пользователям
        await generateUsersPDF(doc, startDate, endDate, null, null);
        
        // 2. Отчет по должникам
        await generateDebtorsPDF(doc, startDate, endDate);
        
        // 3. Отчет по звонкам
        await generateCallsPDF(doc, startDate, endDate, null, null);
        
        // 4. Отчет по интернет трафику
        await generateInternetPDF(doc, startDate, endDate, null, null);
        
        // 5. Отчет по SMS
        await generateSMSPDF(doc, startDate, endDate, null, null);
        
        // 6. Отчет по платежам
        await generatePaymentsPDF(doc, startDate, endDate, null, null);
        
        // Заключительная страница
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ЗАКЛЮЧЕНИЕ', { align: 'center' })
           .moveDown();
        
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#333')
           .text('Данный отчет содержит полную информацию о деятельности компании "Мобильный оператор" за указанный период.')
           .moveDown();
        
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('Отчет включает следующие разделы:', { underline: true })
           .moveDown(0.5);
        
        const sections = [
            '1. Отчет по пользователям - общая информация о всех клиентах',
            '2. Отчет по должникам - клиенты с задолженностью',
            '3. Отчет по звонкам - детальная статистика звонков',
            '4. Отчет по интернет трафику - использование мобильного интернета',
            '5. Отчет по SMS - отправленные и полученные сообщения',
            '6. Отчет по платежам - финансовые операции'
        ];
        
        sections.forEach(section => {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#333')
               .text(section);
        });
        
        doc.moveDown(2);
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666')
           .text('Отчет сгенерирован автоматически системой "Мобильный оператор"')
           .text('Все суммы указаны в белорусских рублях (BYN)')
           .text('© Мобильный оператор. Все права защищены.');
        
    } catch (error) {
        console.error('Ошибка генерации полного отчета:', error);
        throw error;
    }
}
// ========== РЕАЛЬНЫЕ ФУНКЦИИ ДЛЯ PDF ОТЧЕТОВ ==========

// Полный отчет по пользователям с реальными данными
async function generateUsersPDF(doc, startDate, endDate, statusFilter, tariffFilter) {
    try {
        // Получаем данные пользователей
        let userFilter = { role: 'client' };
        
        if (statusFilter === 'debtor') {
            userFilter.debt = { $gt: 0 };
        } else if (statusFilter === 'active') {
            userFilter.balance = { $gte: 0 };
            userFilter.status = 'active';
        } else if (statusFilter === 'blocked') {
            userFilter.status = 'blocked';
        }
        
        if (tariffFilter) {
            userFilter['tariff.id'] = tariffFilter;
        }
        
        if (startDate && endDate) {
            userFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const users = await User.find(userFilter)
            .select('fio phone balance debt status tariff creditLimit createdAt')
            .sort({ createdAt: -1 })
            .lean();
        
        if (users.length === 0) {
            doc.fontSize(14)
               .fillColor('#dc3545')
               .text('Нет данных для отчета по заданным критериям', { align: 'center' });
            return;
        }
        
        // Статистика
        const stats = {
            total: users.length,
            totalBalance: users.reduce((sum, user) => sum + (user.balance || 0), 0),
            totalDebt: users.reduce((sum, user) => sum + (user.debt || 0), 0),
            active: users.filter(u => u.status === 'active').length,
            blocked: users.filter(u => u.status === 'blocked').length,
            averageBalance: users.length > 0 ? 
                users.reduce((sum, user) => sum + (user.balance || 0), 0) / users.length : 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ПОЛЬЗОВАТЕЛЯМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`)
           .text(`Статус: ${getStatusLabel(statusFilter || 'all')}`)
           .text(`Тариф: ${tariffFilter ? TARIFFS[tariffFilter]?.name || tariffFilter : 'Все'}`)
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОБЩАЯ СТАТИСТИКА', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего пользователей: ${stats.total}`)
           .text(`Активных: ${stats.active}`)
           .text(`Заблокированных: ${stats.blocked}`)
           .text(`Общий баланс: ${stats.totalBalance.toFixed(2)} BYN`)
           .text(`Общая задолженность: ${stats.totalDebt.toFixed(2)} BYN`)
           .text(`Средний баланс: ${stats.averageBalance.toFixed(2)} BYN`)
           .moveDown();
        
        // Распределение по тарифам
        const tariffStats = {};
        users.forEach(user => {
            const tariffName = user.tariff?.name || 'Не указан';
            tariffStats[tariffName] = (tariffStats[tariffName] || 0) + 1;
        });
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('РАСПРЕДЕЛЕНИЕ ПО ТАРИФАМ', { underline: true })
           .moveDown(0.5);
        
        Object.keys(tariffStats).forEach(tariff => {
            const count = tariffStats[tariff];
            const percentage = ((count / stats.total) * 100).toFixed(1);
            doc.fontSize(10)
               .text(`${tariff}: ${count} пользователей (${percentage}%)`);
        });
        
        doc.moveDown();
        
        // Таблица пользователей
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК ПОЛЬЗОВАТЕЛЕЙ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [30, 120, 80, 60, 60, 60, 50];
        const headers = ['№', 'ФИО', 'Телефон', 'Баланс', 'Долг', 'Тариф', 'Статус'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        users.forEach((user, index) => {
            // Новая страница если не хватает места
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                // Повторяем заголовки на новой странице
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            // Чередование цветов строк
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 460, 20)
                   .fill('#f8f9fa');
            }
            
            const rowData = [
                (index + 1).toString(),
                user.fio || '-',
                user.phone || '-',
                `${(user.balance || 0).toFixed(2)} BYN`,
                `${(user.debt || 0).toFixed(2)} BYN`,
                user.tariff?.name || 'Стандарт',
                getStatusLabel(user.status || 'active')
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                // Цвет для отрицательных балансов и долгов
                if ((i === 3 && (user.balance || 0) < 0) || (i === 4 && (user.debt || 0) > 0)) {
                    doc.fillColor('#dc3545');
                } else if (i === 3 && (user.balance || 0) >= 0) {
                    doc.fillColor('#28a745');
                } else {
                    doc.fillColor('#333');
                }
                
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по пользователям:', error);
        throw error;
    }
}

// Отчет по звонкам с реальными данными
async function generateCallsPDF(doc, startDate, endDate, phoneFilter, callTypeFilter) {
    try {
        // Фильтрация звонков
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (callTypeFilter) {
            filter.callType = callTypeFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const calls = await Call.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Агрегация для статистики
        const statsAggregation = await Call.aggregate([
            { $match: filter },
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
        ]);
        
        const stats = statsAggregation[0] || {
            totalCalls: 0,
            totalDuration: 0,
            totalCost: 0,
            localCalls: 0,
            internationalCalls: 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ЗВОНКАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (callTypeFilter) doc.text(`Тип звонков: ${callTypeFilter === 'local' ? 'Местные' : 'Международные'}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('СТАТИСТИКА ЗВОНКОВ', { underline: true })
           .moveDown(0.5);
        
        const totalHours = Math.floor(stats.totalDuration / 3600);
        const totalMinutes = Math.floor((stats.totalDuration % 3600) / 60);
        const totalSeconds = stats.totalDuration % 60;
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего звонков: ${stats.totalCalls}`)
           .text(`Общая длительность: ${totalHours}ч ${totalMinutes}м ${totalSeconds}с`)
           .text(`Общая стоимость: ${stats.totalCost.toFixed(2)} BYN`)
           .text(`Местные звонки: ${stats.localCalls} (${stats.totalCalls > 0 ? ((stats.localCalls / stats.totalCalls) * 100).toFixed(1) : 0}%)`)
           .text(`Международные звонки: ${stats.internationalCalls} (${stats.totalCalls > 0 ? ((stats.internationalCalls / stats.totalCalls) * 100).toFixed(1) : 0}%)`)
           .text(`Средняя стоимость звонка: ${stats.totalCalls > 0 ? (stats.totalCost / stats.totalCalls).toFixed(2) : 0} BYN`)
           .moveDown();
        
        if (calls.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о звонках за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица звонков
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК ЗВОНКОВ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 80, 50, 60, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Номер', 'Тип', 'Длительность', 'Стоимость'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        calls.forEach((call, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                // Заголовки на новой странице
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            // Чередование цветов
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 510, 20)
                   .fill('#f8f9fa');
            }
            
            const duration = call.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            
            const rowData = [
                call.date ? new Date(call.date).toLocaleString('ru-RU') : '-',
                call.userId?.fio || call.userFio || '-',
                call.phone || '-',
                call.number || '-',
                call.callType === 'local' ? 'Местный' : 'Международный',
                `${minutes}:${seconds.toString().padStart(2, '0')}`,
                `${(call.cost || 0).toFixed(2)} BYN`
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по звонкам:', error);
        throw error;
    }
}

// Отчет по интернет трафику
async function generateInternetPDF(doc, startDate, endDate, phoneFilter, typeFilter) {
    try {
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (typeFilter) {
            filter.type = typeFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const internetData = await InternetUsage.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Статистика
        const statsAggregation = await InternetUsage.aggregate([
            { $match: filter },
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
        ]);
        
        const stats = statsAggregation[0] || {
            totalSessions: 0,
            totalMB: 0,
            totalCost: 0,
            mobileSessions: 0,
            wifiSessions: 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ИНТЕРНЕТ ТРАФИКУ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (typeFilter) doc.text(`Тип подключения: ${typeFilter === 'mobile' ? 'Мобильный' : 'Wi-Fi'}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('СТАТИСТИКА ТРАФИКА', { underline: true })
           .moveDown(0.5);
        
        const totalGB = stats.totalMB / 1024;
        const avgSessionMB = stats.totalSessions > 0 ? stats.totalMB / stats.totalSessions : 0;
        const avgSessionCost = stats.totalSessions > 0 ? stats.totalCost / stats.totalSessions : 0;
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего сессий: ${stats.totalSessions}`)
           .text(`Общий трафик: ${stats.totalMB.toFixed(2)} МБ (${totalGB.toFixed(2)} ГБ)`)
           .text(`Общая стоимость: ${stats.totalCost.toFixed(2)} BYN`)
           .text(`Мобильный трафик: ${stats.mobileSessions} сессий (${stats.totalSessions > 0 ? ((stats.mobileSessions / stats.totalSessions) * 100).toFixed(1) : 0}%)`)
           .text(`Wi-Fi трафик: ${stats.wifiSessions} сессий (${stats.totalSessions > 0 ? ((stats.wifiSessions / stats.totalSessions) * 100).toFixed(1) : 0}%)`)
           .text(`Средняя сессия: ${avgSessionMB.toFixed(2)} МБ за ${avgSessionCost.toFixed(2)} BYN`)
           .moveDown();
        
        if (internetData.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о трафике за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица данных
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК СЕССИЙ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 60, 60, 80, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Трафик (МБ)', 'Тип', 'Длительность', 'Стоимость'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        internetData.forEach((session, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 520, 20)
                   .fill('#f8f9fa');
            }
            
            const duration = session.sessionDuration || 0;
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const durationText = duration > 0 ? `${hours}ч ${minutes}м` : '-';
            
            const rowData = [
                session.date ? new Date(session.date).toLocaleString('ru-RU') : '-',
                session.userId?.fio || '-',
                session.phone || '-',
                (session.mbUsed || 0).toFixed(2),
                session.type === 'mobile' ? 'Мобильный' : 'Wi-Fi',
                durationText,
                `${(session.cost || 0).toFixed(2)} BYN`
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по трафику:', error);
        throw error;
    }
}

// Отчет по SMS
async function generateSMSPDF(doc, startDate, endDate, phoneFilter, directionFilter) {
    try {
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (directionFilter) {
            filter.direction = directionFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const smsData = await SmsUsage.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Статистика
        const statsAggregation = await SmsUsage.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalSMS: { $sum: 1 },
                    totalCost: { $sum: '$cost' },
                    totalChars: { $sum: '$messageLength' },
                    outgoing: { 
                        $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] }
                    },
                    incoming: { 
                        $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] }
                    }
                }
            }
        ]);
        
        const stats = statsAggregation[0] || {
            totalSMS: 0,
            totalCost: 0,
            totalChars: 0,
            outgoing: 0,
            incoming: 0
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО SMS СООБЩЕНИЯМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (directionFilter) doc.text(`Направление: ${directionFilter === 'outgoing' ? 'Исходящие' : 'Входящие'}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('СТАТИСТИКА SMS', { underline: true })
           .moveDown(0.5);
        
        const avgChars = stats.totalSMS > 0 ? stats.totalChars / stats.totalSMS : 0;
        const avgCost = stats.totalSMS > 0 ? stats.totalCost / stats.totalSMS : 0;
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего SMS: ${stats.totalSMS}`)
           .text(`Общая стоимость: ${stats.totalCost.toFixed(2)} BYN`)
           .text(`Всего символов: ${stats.totalChars}`)
           .text(`Исходящие SMS: ${stats.outgoing} (${stats.totalSMS > 0 ? ((stats.outgoing / stats.totalSMS) * 100).toFixed(1) : 0}%)`)
           .text(`Входящие SMS: ${stats.incoming} (${stats.totalSMS > 0 ? ((stats.incoming / stats.totalSMS) * 100).toFixed(1) : 0}%)`)
           .text(`Средняя длина: ${avgChars.toFixed(0)} символов`)
           .text(`Средняя стоимость: ${avgCost.toFixed(2)} BYN`)
           .moveDown();
        
        if (smsData.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о SMS за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица данных
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК SMS', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 80, 80, 60, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Получатель', 'Направление', 'Длина', 'Стоимость'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        smsData.forEach((sms, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 540, 20)
                   .fill('#f8f9fa');
            }
            
            const rowData = [
                sms.date ? new Date(sms.date).toLocaleString('ru-RU') : '-',
                sms.userId?.fio || '-',
                sms.phone || '-',
                sms.recipientNumber || '-',
                sms.direction === 'outgoing' ? 'Исходящее' : 'Входящее',
                `${sms.messageLength || 0} симв.`,
                `${(sms.cost || 0).toFixed(2)} BYN`
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по SMS:', error);
        throw error;
    }
}

// Отчет по платежам
async function generatePaymentsPDF(doc, startDate, endDate, phoneFilter, typeFilter) {
    try {
        let filter = {};
        
        if (phoneFilter) {
            filter.phone = { $regex: phoneFilter, $options: 'i' };
        }
        
        if (typeFilter) {
            filter.type = typeFilter;
        }
        
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const payments = await Payment.find(filter)
            .populate('userId', 'fio phone')
            .sort({ date: -1 })
            .limit(500)
            .lean();
        
        // Статистика
        const statsAggregation = await Payment.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalPayments: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalIncome: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
                    totalExpense: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } }
                }
            }
        ]);
        
        const stats = statsAggregation[0] || {
            totalPayments: 0,
            totalAmount: 0,
            totalIncome: 0,
            totalExpense: 0
        };
        
        // Распределение по типам
        const typeStats = await Payment.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    amount: { $sum: '$amount' }
                }
            }
        ]);
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ОТЧЕТ ПО ПЛАТЕЖАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`);
        
        if (phoneFilter) doc.text(`Фильтр по телефону: ${phoneFilter}`);
        if (typeFilter) doc.text(`Тип платежа: ${getPaymentTypeLabel(typeFilter)}`);
        
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ФИНАНСОВАЯ СТАТИСТИКА', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего платежей: ${stats.totalPayments}`)
           .text(`Общая сумма операций: ${stats.totalAmount.toFixed(2)} BYN`)
           .text(`Общий доход (пополнения): ${stats.totalIncome.toFixed(2)} BYN`)
           .text(`Общие расходы (списания): ${Math.abs(stats.totalExpense).toFixed(2)} BYN`)
           .text(`Чистый доход: ${(stats.totalIncome + stats.totalExpense).toFixed(2)} BYN`)
           .moveDown();
        
        // Распределение по типам
        if (typeStats.length > 0) {
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#1976d2')
               .text('РАСПРЕДЕЛЕНИЕ ПО ТИПАМ ПЛАТЕЖЕЙ', { underline: true })
               .moveDown(0.5);
            
            typeStats.forEach(typeStat => {
                const percentage = (typeStat.count / stats.totalPayments * 100).toFixed(1);
                doc.fontSize(10)
                   .text(`${getPaymentTypeLabel(typeStat._id)}: ${typeStat.count} платежей (${percentage}%), сумма: ${typeStat.amount.toFixed(2)} BYN`);
            });
            
            doc.moveDown();
        }
        
        if (payments.length === 0) {
            doc.fontSize(14)
               .fillColor('#666')
               .text('Нет данных о платежах за выбранный период', { align: 'center' });
            return;
        }
        
        // Таблица платежей
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ДЕТАЛЬНЫЙ СПИСОК ПЛАТЕЖЕЙ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [90, 100, 70, 60, 80, 70, 60];
        const headers = ['Дата и время', 'Пользователь', 'Телефон', 'Сумма', 'Тип', 'Метод', 'Статус'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#1976d2');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        payments.forEach((payment, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#1976d2');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 530, 20)
                   .fill('#f8f9fa');
            }
            
            const amountColor = payment.amount > 0 ? '#28a745' : '#dc3545';
            const amountSign = payment.amount > 0 ? '+' : '';
            
            const rowData = [
                payment.date ? new Date(payment.date).toLocaleString('ru-RU') : '-',
                payment.userId?.fio || '-',
                payment.phone || '-',
                `${amountSign}${(payment.amount || 0).toFixed(2)} BYN`,
                getPaymentTypeLabel(payment.type),
                payment.method || '-',
                'Успешно'
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                if (i === 3) {
                    doc.fillColor(amountColor);
                } else {
                    doc.fillColor('#333');
                }
                
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                
                doc.fillColor('#333');
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
    } catch (error) {
        console.error('Ошибка генерации отчета по платежам:', error);
        throw error;
    }
}

// Отчет по должникам
async function generateDebtorsPDF(doc, startDate, endDate) {
    try {
        let filter = { 
            debt: { $gt: 0 },
            role: 'client'
        };
        
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }
        
        const debtors = await User.find(filter)
            .select('fio phone balance debt tariff status createdAt')
            .sort({ debt: -1 })
            .lean();
        
        // Статистика
        const statsAggregation = await User.aggregate([
            { $match: filter },
            { 
                $group: {
                    _id: null,
                    totalDebtors: { $sum: 1 },
                    totalDebt: { $sum: '$debt' },
                    avgDebt: { $avg: '$debt' },
                    maxDebt: { $max: '$debt' },
                    minDebt: { $min: '$debt' }
                }
            }
        ]);
        
        const stats = statsAggregation[0] || {
            totalDebtors: 0,
            totalDebt: 0,
            avgDebt: 0,
            maxDebt: 0,
            minDebt: 0
        };
        
        // Группировка по сумме долга
        const debtGroups = {
            small: debtors.filter(d => (d.debt || 0) <= 50).length,
            medium: debtors.filter(d => (d.debt || 0) > 50 && (d.debt || 0) <= 200).length,
            large: debtors.filter(d => (d.debt || 0) > 200).length
        };
        
        // Заголовок страницы
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('ОТЧЕТ ПО ДОЛЖНИКАМ', { align: 'center' })
           .moveDown();
        
        // Параметры отчета
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'} - ${endDate ? formatDate(endDate) : 'Текущая дата'}`)
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`)
           .moveDown();
        
        // Важное предупреждение
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('ВНИМАНИЕ! СРОЧНОЕ ИСПОЛНЕНИЕ', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text('Следующие пользователи имеют задолженность по оплате услуг связи.')
           .text('Рекомендуется предпринять меры для взыскания задолженности.')
           .moveDown();
        
        // Статистика
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('СТАТИСТИКА ЗАДОЛЖЕННОСТИ', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text(`Всего должников: ${stats.totalDebtors}`)
           .text(`Общая сумма долга: ${stats.totalDebt.toFixed(2)} BYN`)
           .text(`Средний долг: ${stats.avgDebt.toFixed(2)} BYN`)
           .text(`Максимальный долг: ${stats.maxDebt.toFixed(2)} BYN`)
           .text(`Минимальный долг: ${stats.minDebt.toFixed(2)} BYN`)
           .moveDown();
        
        // Группировка по сумме
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('ГРУППИРОВКА ПО СУММЕ ДОЛГА', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .text(`Малые долги (до 50 BYN): ${debtGroups.small} чел. (${stats.totalDebtors > 0 ? ((debtGroups.small / stats.totalDebtors) * 100).toFixed(1) : 0}%)`)
           .text(`Средние долги (50-200 BYN): ${debtGroups.medium} чел. (${stats.totalDebtors > 0 ? ((debtGroups.medium / stats.totalDebtors) * 100).toFixed(1) : 0}%)`)
           .text(`Крупные долги (более 200 BYN): ${debtGroups.large} чел. (${stats.totalDebtors > 0 ? ((debtGroups.large / stats.totalDebtors) * 100).toFixed(1) : 0}%)`)
           .moveDown();
        
        if (debtors.length === 0) {
            doc.fontSize(14)
               .fillColor('#28a745')
               .text('Должников не обнаружено!', { align: 'center' });
            return;
        }
        
        // Таблица должников
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('СПИСОК ДОЛЖНИКОВ', { align: 'center' })
           .moveDown();
        
        // Заголовки таблицы
        const tableTop = doc.y;
        const tableLeft = 40;
        const colWidths = [30, 120, 80, 60, 70, 60, 70];
        const headers = ['№', 'ФИО', 'Телефон', 'Баланс', 'Долг', 'Тариф', 'Статус'];
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#fff');
        
        let currentX = tableLeft;
        headers.forEach((header, i) => {
            doc.rect(currentX, tableTop, colWidths[i], 20)
               .fill('#dc3545');
            doc.fillColor('#fff')
               .text(header, currentX + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
            currentX += colWidths[i];
        });
        
        // Данные таблицы
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#333');
        
        let currentY = tableTop + 25;
        let rowIndex = 0;
        
        debtors.forEach((debtor, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                let newX = tableLeft;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor('#fff');
                    doc.rect(newX, currentY - 25, colWidths[i], 20)
                       .fill('#dc3545');
                    doc.fillColor('#fff')
                       .text(header, newX + 5, currentY - 20, { width: colWidths[i] - 10, align: 'left' });
                    newX += colWidths[i];
                });
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#333');
                currentY += 5;
            }
            
            if (rowIndex % 2 === 0) {
                doc.rect(tableLeft, currentY - 5, 490, 20)
                   .fill('#fdf2f2');
            }
            
            const rowData = [
                (index + 1).toString(),
                debtor.fio || '-',
                debtor.phone || '-',
                `${(debtor.balance || 0).toFixed(2)} BYN`,
                `${(debtor.debt || 0).toFixed(2)} BYN`,
                debtor.tariff?.name || 'Стандарт',
                getStatusLabel(debtor.status || 'active')
            ];
            
            currentX = tableLeft;
            rowData.forEach((cell, i) => {
                // Красный цвет для долгов и отрицательных балансов
                if ((i === 3 && (debtor.balance || 0) < 0) || i === 4) {
                    doc.fillColor('#dc3545');
                } else {
                    doc.fillColor('#333');
                }
                
                doc.text(cell, currentX + 5, currentY, { 
                    width: colWidths[i] - 10,
                    align: 'left',
                    height: 20
                });
                
                doc.fillColor('#333');
                currentX += colWidths[i];
            });
            
            currentY += 20;
            rowIndex++;
        });
        
        // Рекомендации
        doc.moveDown(2);
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#dc3545')
           .text('РЕКОМЕНДАЦИИ:', { underline: true })
           .moveDown(0.5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333')
           .text('1. Связаться с должниками для уточнения причин задолженности')
           .text('2. Предложить варианты реструктуризации долга')
           .text('3. Применить штрафные санкции согласно договору')
           .text('4. Рассмотреть возможность ограничения услуг')
           .text('5. Передать данные о злостных должниках в коллекторские агентства');
        
    } catch (error) {
        console.error('Ошибка генерации отчета по должникам:', error);
        throw error;
    }
}
// Улучшенные функции экспорта отчетов

async function exportUsersReport() {
    try {
        showNotification('Формирование отчета по пользователям...', 'info');
        
        const status = document.getElementById('statusFilter').value;
        const tariff = document.getElementById('tariffFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        // Формируем URL
        let url = `/api/reports/pdf?type=users`;
        const params = [];
        
        if (status) params.push(`status=${encodeURIComponent(status)}`);
        if (tariff) params.push(`tariff=${encodeURIComponent(tariff)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '&' + params.join('&');
        }
        
        // Создаем ссылку для скачивания
        const link = document.createElement('a');
        link.href = url;
        link.download = `users_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по пользователям успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по пользователям:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportDebtorsReport() {
    try {
        showNotification('Формирование отчета по должникам...', 'info');
        
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        const url = `/api/reports/pdf?type=debtors&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `debtors_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по должникам успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по должникам:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportActiveUsersReport() {
    try {
        showNotification('Формирование отчета по активным пользователям...', 'info');
        
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        const tariff = document.getElementById('tariffFilter').value;
        
        let url = `/api/reports/pdf?type=users&status=active`;
        const params = [];
        
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        if (tariff) params.push(`tariff=${encodeURIComponent(tariff)}`);
        
        if (params.length > 0) {
            url += '&' + params.join('&');
        }
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `active_users_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по активным пользователям успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по активным пользователям:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportCallsReport() {
    try {
        showNotification('Формирование отчета по звонкам...', 'info');
        
        const phone = document.getElementById('callsPhoneFilter').value;
        const callType = document.getElementById('callsTypeFilter').value;
        const startDate = document.getElementById('callsStartDate').value;
        const endDate = document.getElementById('callsEndDate').value;
        
        let url = `/api/reports/pdf?type=calls`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (callType) params.push(`callType=${encodeURIComponent(callType)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '&' + params.join('&');
        }
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `calls_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по звонкам успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по звонкам:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportInternetReport() {
    try {
        showNotification('Формирование отчета по интернет трафику...', 'info');
        
        const phone = document.getElementById('callsPhoneFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        let url = `/api/reports/pdf?type=internet`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '&' + params.join('&');
        }
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `internet_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по интернет трафику успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по интернету:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportSMSReport() {
    try {
        showNotification('Формирование отчета по SMS...', 'info');
        
        const phone = document.getElementById('messagesPhoneFilter').value;
        const direction = document.getElementById('messagesDirectionFilter').value;
        const startDate = document.getElementById('messagesStartDate').value;
        const endDate = document.getElementById('messagesEndDate').value;
        
        let url = `/api/reports/pdf?type=sms`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (direction) params.push(`direction=${encodeURIComponent(direction)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '&' + params.join('&');
        }
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `sms_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по SMS успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по SMS:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportPaymentsReport() {
    try {
        showNotification('Формирование отчета по платежам...', 'info');
        
        const phone = document.getElementById('callsPhoneFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        let url = `/api/reports/pdf?type=payments`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '&' + params.join('&');
        }
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `payments_report_${startDate || 'all'}_${endDate || 'current'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по платежам успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по платежам:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function exportFullReport() {
    try {
        showNotification('Формирование полного отчета...', 'info');
        
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        if (!startDate || !endDate) {
            showNotification('Необходимо указать обе даты в фильтрах отчетов', 'error');
            return;
        }
        
        const url = `/api/reports/pdf?type=full&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `full_report_${startDate}_${endDate}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Полный отчет успешно сформирован', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта полного отчета:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

// Функции для модального окна отчетов
async function generateUsersReport() {
    try {
        if (!validateReportDates()) return;
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        showNotification('Генерация отчета по пользователям...', 'info');
        
        const url = `/api/reports/pdf?type=users&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        // Скачиваем через скрытую ссылку
        const link = document.createElement('a');
        link.href = url;
        link.download = `users_report_${startDate}_${endDate}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по пользователям успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка генерации отчета по пользователям:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function generateDebtorsReport() {
    try {
        if (!validateReportDates()) return;
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        showNotification('Генерация отчета по должникам...', 'info');
        
        const url = `/api/reports/pdf?type=debtors&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `debtors_report_${startDate}_${endDate}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по должникам успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка генерации отчета по должникам:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function generatePaymentsReport() {
    try {
        if (!validateReportDates()) return;
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        showNotification('Генерация отчета по платежам...', 'info');
        
        const url = `/api/reports/pdf?type=payments&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `payments_report_${startDate}_${endDate}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по платежам успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка генерации отчета по платежам:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function generateCallsMessagesReport() {
    try {
        if (!validateReportDates()) return;
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        showNotification('Генерация отчетов по звонкам и сообщениям...', 'info');
        
        // Сначала отчет по звонкам
        setTimeout(() => {
            const callsUrl = `/api/reports/pdf?type=calls&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            const callsLink = document.createElement('a');
            callsLink.href = callsUrl;
            callsLink.download = `calls_report_${startDate}_${endDate}.pdf`;
            callsLink.style.display = 'none';
            document.body.appendChild(callsLink);
            callsLink.click();
            document.body.removeChild(callsLink);
        }, 100);
        
        // Потом отчет по SMS
        setTimeout(() => {
            const smsUrl = `/api/reports/pdf?type=sms&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            const smsLink = document.createElement('a');
            smsLink.href = smsUrl;
            smsLink.download = `sms_report_${startDate}_${endDate}.pdf`;
            smsLink.style.display = 'none';
            document.body.appendChild(smsLink);
            smsLink.click();
            document.body.removeChild(smsLink);
        }, 1000);
        
        showNotification('Отчеты по звонкам и сообщениям успешно сгенерированы', 'success');
        
    } catch (error) {
        console.error('Ошибка генерации отчетов:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

async function generateFullReport() {
    try {
        if (!validateReportDates()) return;
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        showNotification('Генерация полного отчета. Это может занять некоторое время...', 'info');
        
        const url = `/api/reports/pdf?type=full&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `full_report_${startDate}_${endDate}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Полный отчет успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка генерации полного отчета:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}

// Тестовая функция для проверки PDF
async function testPDF() {
    try {
        showNotification('Генерация тестового отчета...', 'info');
        
        const url = `/api/reports/test/pdf?type=test`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `test_report_${new Date().toISOString().split('T')[0]}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => {
            window.URL.revokeObjectURL(downloadUrl);
        }, 100);
        
        showNotification('Тестовый отчет успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка тестирования PDF:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}
// Функция для показа прогресса генерации отчета
function showReportProgress(message) {
    // Создаем или получаем элемент прогресса
    let progressBar = document.getElementById('reportProgressBar');
    let statusDiv = document.getElementById('reportStatus');
    
    if (!progressBar) {
        const progressHTML = `
            <div class="report-progress" id="reportProgress">
                <div class="report-progress-bar" id="reportProgressBar"></div>
            </div>
            <div class="report-status" id="reportStatus"></div>
        `;
        document.body.insertAdjacentHTML('beforeend', progressHTML);
        progressBar = document.getElementById('reportProgressBar');
        statusDiv = document.getElementById('reportStatus');
    }
    
    // Показываем прогресс
    statusDiv.textContent = message;
    statusDiv.classList.add('show');
    progressBar.style.width = '0%';
    
    // Анимация прогресса
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 90) {
            clearInterval(interval);
        } else {
            width += 10;
            progressBar.style.width = width + '%';
        }
    }, 500);
    
    return {
        update: (newMessage) => {
            statusDiv.textContent = newMessage;
        },
        complete: () => {
            clearInterval(interval);
            progressBar.style.width = '100%';
            setTimeout(() => {
                statusDiv.classList.remove('show');
                progressBar.style.width = '0%';
            }, 1000);
        },
        error: (errorMessage) => {
            clearInterval(interval);
            statusDiv.textContent = errorMessage;
            progressBar.style.background = '#dc3545';
            setTimeout(() => {
                statusDiv.classList.remove('show');
                progressBar.style.width = '0%';
                progressBar.style.background = '#1976d2';
            }, 3000);
        }
    };
}

// Обновленная функция экспорта с прогрессом
async function exportReportWithProgress(reportFunction, reportName) {
    const progress = showReportProgress(`Начинаем формирование отчета "${reportName}"...`);
    
    try {
        progress.update('Получение данных из базы...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        progress.update('Обработка данных...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        progress.update('Формирование PDF документа...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Вызываем основную функцию отчета
        await reportFunction();
        
        progress.update('Отчет успешно сформирован!');
        progress.complete();
        
    } catch (error) {
        progress.error(`Ошибка: ${error.message}`);
        throw error;
    }
}

// Пример использования с прогрессом
async function exportUsersReportWithProgress() {
    await exportReportWithProgress(exportUsersReport, 'Отчет по пользователям');
}

async function exportFullReportWithProgress() {
    await exportReportWithProgress(exportFullReport, 'Полный отчет');
}
// Полный отчет (все данные)
async function generateFullPDF(doc, startDate, endDate) {
    try {
        // Обложка
        doc.fontSize(28)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ПОЛНЫЙ ОТЧЕТ', 0, 150, { align: 'center' });
        
        doc.fontSize(18)
           .font('Helvetica')
           .fillColor('#666')
           .text('Мобильный оператор', 0, 200, { align: 'center' });
        
        doc.fontSize(14)
           .text(`Период: ${startDate ? formatDate(startDate) : 'Все время'}`, 0, 250, { align: 'center' })
           .text(`${endDate ? formatDate(endDate) : 'Текущая дата'}`, 0, 270, { align: 'center' });
        
        doc.fontSize(12)
           .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, 0, 300, { align: 'center' })
           .text(`${new Date().toLocaleTimeString('ru-RU')}`, 0, 315, { align: 'center' });
        
        // 1. Отчет по пользователям
        await generateUsersPDF(doc, startDate, endDate, null, null);
        
        // 2. Отчет по должникам
        await generateDebtorsPDF(doc, startDate, endDate);
        
        // 3. Отчет по звонкам
        await generateCallsPDF(doc, startDate, endDate, null, null);
        
        // 4. Отчет по интернет трафику
        await generateInternetPDF(doc, startDate, endDate, null, null);
        
        // 5. Отчет по SMS
        await generateSMSPDF(doc, startDate, endDate, null, null);
        
        // 6. Отчет по платежам
        await generatePaymentsPDF(doc, startDate, endDate, null, null);
        
        // Заключительная страница
        doc.addPage();
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('ЗАКЛЮЧЕНИЕ', { align: 'center' })
           .moveDown();
        
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#333')
           .text('Данный отчет содержит полную информацию о деятельности компании "Мобильный оператор" за указанный период.')
           .moveDown();
        
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#1976d2')
           .text('Отчет включает следующие разделы:', { underline: true })
           .moveDown(0.5);
        
        const sections = [
            '1. Отчет по пользователям - общая информация о всех клиентах',
            '2. Отчет по должникам - клиенты с задолженностью',
            '3. Отчет по звонкам - детальная статистика звонков',
            '4. Отчет по интернет трафику - использование мобильного интернета',
            '5. Отчет по SMS - отправленные и полученные сообщения',
            '6. Отчет по платежам - финансовые операции'
        ];
        
        sections.forEach(section => {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#333')
               .text(section);
        });
        
        doc.moveDown(2);
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666')
           .text('Отчет сгенерирован автоматически системой "Мобильный оператор"')
           .text('Все суммы указаны в белорусских рублях (BYN)')
           .text('© Мобильный оператор. Все права защищены.');
        
    } catch (error) {
        console.error('Ошибка генерации полного отчета:', error);
        throw error;
    }
}
// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация админ-панели...');
    
    // Установка дат по умолчанию
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Установка дат в фильтрах отчетов
    document.getElementById('startDateFilter').value = firstDayOfMonth.toISOString().split('T')[0];
    document.getElementById('endDateFilter').value = today.toISOString().split('T')[0];
    
    // Установка дат в модальном окне отчетов
    const reportStartDate = document.getElementById('reportStartDate');
    const reportEndDate = document.getElementById('reportEndDate');
    
    if (reportStartDate && reportEndDate) {
        reportStartDate.value = firstDayOfMonth.toISOString().split('T')[0];
        reportEndDate.value = today.toISOString().split('T')[0];
        
        // Добавляем валидацию
        reportStartDate.addEventListener('change', validateReportDates);
        reportEndDate.addEventListener('change', validateReportDates);
    }
    
    // Загрузка начальных данных
    loadDashboardData();
    
    // Автообновление каждые 30 секунд
    setInterval(loadDashboardData, 30000);
    
    console.log('Админ-панель инициализирована');
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
        document.getElementById('editUserId').value = user._id;
        document.getElementById('editUserFio').value = user.fio;
        document.getElementById('editUserStatus').value = user.status || 'active';
        
        // Устанавливаем выбранный тариф
        if (user.tariff?.id) {
            document.getElementById('editUserTariff').value = user.tariff.id;
        } else {
            document.getElementById('editUserTariff').value = 'standard';
        }
        
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

        // Заполняем финансовую информацию
        const balanceValue = parseFloat(user.balance) || 0;
        const debtValue = parseFloat(user.debt) || 0;
        const creditLimit = parseFloat(user.creditLimit) || 50;
        const availableCredit = Math.max(0, creditLimit + balanceValue);
        
        document.getElementById('modalUserBalance').innerHTML = 
            `<span class="${balanceValue >= 0 ? 'text-success' : 'text-danger'} fw-bold">
                ${balanceValue.toFixed(2)} BYN
            </span>`;
        
        document.getElementById('modalUserDebt').innerHTML = 
            `<span class="text-danger fw-bold">
                ${debtValue.toFixed(2)} BYN
            </span>`;
        
        document.getElementById('modalUserCreditLimit').innerHTML = 
            `<span class="text-info fw-bold">
                ${creditLimit.toFixed(2)} BYN
            </span>`;
        
        document.getElementById('modalUserAvailableCredit').innerHTML = 
            `<span class="${availableCredit > 0 ? 'text-success' : 'text-warning'} fw-bold">
                ${availableCredit.toFixed(2)} BYN
            </span>`;

        // Сбрасываем поля пароля и финансовых операций
        document.getElementById('editUserPassword').value = '';
        document.getElementById('addBalanceAmount').value = '';
        document.getElementById('withdrawBalanceAmount').value = '';

        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();

        // Инициализируем чекбоксы услуг
        initializeServicesCheckboxes();

        // Загружаем услуги пользователя
        await loadUserServices();
        showNotification('Данные пользователя загружены', 'success');
        

    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        showNotification('Ошибка загрузки данных пользователя', 'error');
    }
}

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
        // Загружаем услуги пользователя через API
        const response = await fetch(`/api/admin/user/services?phone=${encodeURIComponent(currentEditingUser.phone)}`);
        const result = await response.json();
        
        const userServices = result.services || [];
        const servicesList = document.getElementById('userServicesList');

        if (userServices.length === 0 || userServices.every(s => !s.active)) {
            servicesList.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning mb-0">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        У пользователя нет подключенных услуг
                    </div>
                </div>
            `;
        } else {
            // Группируем услуги по категориям
            const servicesByCategory = {};
            
            userServices.filter(service => service.active).forEach(service => {
                if (!servicesByCategory[service.category]) {
                    servicesByCategory[service.category] = [];
                }
                servicesByCategory[service.category].push(service);
            });
            
            // Отображаем услуги по категориям
            let servicesHTML = '';
            
            Object.keys(servicesByCategory).forEach(category => {
                const categoryServices = servicesByCategory[category];
                const categoryTotal = categoryServices.reduce((sum, service) => {
                    const price = parseFloat(service.price) || 0;
                    return sum + price;
                }, 0);
                
                servicesHTML += `
                    <div class="col-12 mb-3">
                        <div class="card">
                            <div class="card-header py-2">
                                <h6 class="mb-0">
                                    <i class="fas fa-folder me-2"></i>
                                    ${getCategoryName(category)}
                                    <span class="badge bg-secondary float-end">${categoryServices.length} услуг</span>
                                </h6>
                            </div>
                            <div class="card-body">
                                <div class="row g-2">
                                    ${categoryServices.map(service => `
                                        <div class="col-md-6">
                                            <div class="alert alert-success mb-0">
                                                <div class="d-flex justify-content-between align-items-start">
                                                    <div>
                                                        <strong>${service.name}</strong><br>
                                                        <small class="text-muted">${service.description}</small><br>
                                                        <span class="badge bg-primary">${service.price}</span>
                                                    </div>
                                                    <div class="form-check form-switch">
                                                        <input class="form-check-input" type="checkbox" 
                                                               id="service_${service.id}" 
                                                               value="${service.id}" 
                                                               checked disabled
                                                               style="cursor: default;">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                ${categoryServices.length > 1 ? `
                                    <div class="mt-2 text-end">
                                        <small class="text-muted">
                                            Итого по категории: <strong>${categoryTotal.toFixed(2)} BYN/мес</strong>
                                        </small>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
            
            // Добавляем общую стоимость
            const totalCost = userServices.filter(s => s.active).reduce((total, service) => {
                const price = parseFloat(service.price) || 0;
                return total + price;
            }, 0);
            
            servicesHTML += `
                <div class="col-12">
                    <div class="alert alert-info">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong><i class="fas fa-calculator me-2"></i>Общая стоимость услуг</strong><br>
                                <small>Ежемесячная плата за все подключенные услуги</small>
                            </div>
                            <div class="h4 mb-0">${totalCost.toFixed(2)} BYN</div>
                        </div>
                    </div>
                </div>
            `;
            
            servicesList.innerHTML = servicesHTML;
        }
        
        // Обновляем состояние чекбоксов в списке доступных услуг
        const activeServices = userServices.filter(s => s.active).map(s => s.id);
        updateServicesCheckboxes(activeServices);
        
    } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
        const servicesList = document.getElementById('userServicesList');
        servicesList.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Ошибка загрузки услуг: ${error.message}
                </div>
            </div>
        `;
    }
}

// Загрузка статистики использования
async function loadUserUsageStats() {
    if (!currentEditingUser) return;
    
    try {
        const response = await fetch(`/api/admin/user/usage?phone=${encodeURIComponent(currentEditingUser.phone)}`);
        const result = await response.json();
        
        if (result.success) {
            const usage = result.usage;
            const tariffMinutes = usage.tariffMinutes || 300;
            const tariffInternetMB = usage.tariffInternetMB || 15360;
            const tariffSMS = usage.tariffSMS || 100;
            
            document.getElementById('usageMinutes').textContent = 
                `${usage.minutes || 0} из ${tariffMinutes}`;
            document.getElementById('usageInternet').textContent = 
                `${usage.internetMB || 0} МБ из ${tariffInternetMB} МБ`;
            document.getElementById('usageSMS').textContent = 
                `${usage.sms || 0} из ${tariffSMS}`;
        } else {
            console.error('Ошибка загрузки статистики:', result.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики использования:', error);
    }
}

// ==================== ФУНКЦИИ ДЛЯ ОТЧЕТОВ ====================

// Показать модальное окно отчетов
function showReportsModal() {
    const modal = new bootstrap.Modal(document.getElementById('reportsModal'));
    
    // Установить даты по умолчанию
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    document.getElementById('reportStartDate').value = formatDate(startDate);
    document.getElementById('reportEndDate').value = formatDate(now);
    
    modal.show();
}

// Показать историю отчетов
function showReportHistory() {
    const modal = new bootstrap.Modal(document.getElementById('reportHistoryModal'));
    modal.show();
    loadReportHistory();
}

// Загрузить историю отчетов
async function loadReportHistory() {
    try {
        const response = await fetch('/api/reports/history');
        const reports = await response.json();
        
        const table = document.getElementById('reportHistoryTable');
        table.innerHTML = '';
        
        if (reports.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <div class="text-muted">
                            <i class="fas fa-file-pdf fa-2x mb-3"></i>
                            <p>Нет сгенерированных отчетов</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        reports.forEach(report => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDateTime(report.created_at)}</td>
                <td>
                    <span class="report-history-type report-type-${report.type}">
                        ${getReportTypeName(report.type)}
                    </span>
                </td>
                <td>${formatDate(report.start_date)} - ${formatDate(report.end_date)}</td>
                <td>${formatFileSize(report.size)}</td>
                <td>
                    <span class="badge bg-${report.status === 'completed' ? 'success' : 'warning'}">
                        ${report.status === 'completed' ? 'Готов' : 'В процессе'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline-primary btn-sm-icon" 
                                onclick="downloadReport(${report.id})" 
                                ${report.status !== 'completed' ? 'disabled' : ''}>
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-sm-icon" 
                                onclick="deleteReport(${report.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            table.appendChild(row);
        });
    } catch (error) {
        console.error('Ошибка загрузки истории отчетов:', error);
        showNotification('Ошибка загрузки истории отчетов', 'error');
    }
}

// Получить название типа отчета
function getReportTypeName(type) {
    const types = {
        'users': 'Пользователи',
        'calls_messages': 'Звонки и сообщения',
        'debtors': 'Должники',
        'payments': 'Оплаты',
        'full': 'Полный отчет'
    };
    return types[type] || type;
}

// Форматировать размер файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Обновленные функции для отчетов

// Генерация отчета по пользователям
// Обновленная функция генерации отчета по пользователям
async function generateUsersReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Генерация отчета по пользователям...', 'info');
    
    try {
        // Используем новый эндпоинт
        const url = `/api/reports/test/pdf?type=users&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        // Создаем скрытую ссылку для скачивания
        const a = document.createElement('a');
        a.href = url;
        a.download = `Отчет_по_пользователям_${startDate || 'все'}_${endDate || 'время'}.pdf`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showNotification('Отчет по пользователям успешно сгенерирован', 'success');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета: ' + error.message, 'error');
    }
}

// Загрузка отчета по должникам
async function loadDebtorsReport() {
    try {
        showNotification('Загрузка отчета по должникам...', 'info');
        
        const response = await fetch('/api/reports/debtors');
        const result = await response.json();
        
        if (result.success) {
            const container = document.getElementById('debtorsReport');
            
            let html = `
                <div class="report-card">
                    <div class="report-header">
                        <div class="report-title">Отчет по должникам</div>
                        <div class="report-value">${result.statistics.totalDebtors} клиентов</div>
                    </div>
                    
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <div class="alert alert-info">
                                <h6><i class="fas fa-chart-bar me-2"></i>Общая статистика</h6>
                                <p><strong>Общая задолженность:</strong> ${result.statistics.totalDebt} BYN</p>
                                <p><strong>Средний долг:</strong> ${result.statistics.averageDebt} BYN</p>
                                <p><strong>Максимальный долг:</strong> ${result.statistics.maxDebt} BYN</p>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="alert alert-warning">
                                <h6><i class="fas fa-users me-2"></i>Группировка по сумме долга</h6>
                                <p><small>до 50 BYN:</strong> ${result.statistics.debtGroups.small} чел.</p>
                                <p><small>50-200 BYN:</strong> ${result.statistics.debtGroups.medium} чел.</p>
                                <p><small>более 200 BYN:</strong> ${result.statistics.debtGroups.large} чел.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="table-responsive mt-3">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>ФИО</th>
                                    <th>Телефон</th>
                                    <th>Баланс</th>
                                    <th>Долг</th>
                                    <th>Тариф</th>
                                    <th>Статус</th>
                                    <th>Дата регистрации</th>
                                </tr>
                            </thead>
                            <tbody>`;
            
            result.debtors.forEach((debtor, index) => {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${debtor.fio}</td>
                        <td>${debtor.phone}</td>
                        <td class="${parseFloat(debtor.balance) < 0 ? 'text-danger' : 'text-success'} fw-bold">
                            ${debtor.balance} BYN
                        </td>
                        <td class="text-danger fw-bold">${debtor.debt} BYN</td>
                        <td>${debtor.tariff}</td>
                        <td>
                            <span class="badge ${debtor.status === 'active' ? 'bg-warning' : 'bg-danger'}">
                                ${debtor.status === 'active' ? 'Активный (должник)' : 'Заблокирован'}
                            </span>
                        </td>
                        <td>${debtor.createdAt}</td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="mt-3 text-end">
                        <button class="btn btn-danger" onclick="generateDebtorsReport()">
                            <i class="fas fa-file-pdf me-2"></i>Скачать PDF отчет
                        </button>
                    </div>
                </div>
            `;
            
            container.innerHTML = html;
            showNotification('Отчет по должникам загружен', 'success');
        } else {
            showNotification(result.error || 'Ошибка загрузки отчета', 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки отчета по должникам:', error);
        showNotification('Ошибка загрузки отчета по должникам', 'error');
    }
}
// Обновленная функция генерации полного отчета
async function generateFullReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Генерация полного отчета...', 'info');
    
    try {
        const url = `/api/reports/test/pdf?type=full&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        // Используем fetch для получения файла
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        // Получаем blob
        const blob = await response.blob();
        
        // Создаем ссылку для скачивания
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Полный_отчет_${startDate || 'все'}_${endDate || 'время'}.pdf`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Очищаем URL
        setTimeout(() => {
            window.URL.revokeObjectURL(downloadUrl);
        }, 100);
        
        showNotification('Полный отчет успешно сгенерирован', 'success');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета: ' + error.message, 'error');
    }
}


async function generateCallsMessagesReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Генерация отчетов по звонкам и сообщениям...', 'info');
    
    try {
        // Сначала отчет по звонкам
        setTimeout(() => {
            const callsUrl = `/api/reports/test/pdf?type=calls&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            const callsLink = document.createElement('a');
            callsLink.href = callsUrl;
            callsLink.download = `Отчет_по_звонкам_${startDate || 'все'}_${endDate || 'время'}.pdf`;
            callsLink.style.display = 'none';
            document.body.appendChild(callsLink);
            callsLink.click();
            document.body.removeChild(callsLink);
        }, 100);
        
        // Потом отчет по SMS
        setTimeout(() => {
            const smsUrl = `/api/reports/test/pdf?type=sms&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            const smsLink = document.createElement('a');
            smsLink.href = smsUrl;
            smsLink.download = `Отчет_по_SMS_${startDate || 'все'}_${endDate || 'время'}.pdf`;
            smsLink.style.display = 'none';
            document.body.appendChild(smsLink);
            smsLink.click();
            document.body.removeChild(smsLink);
        }, 1000);
        
        showNotification('Отчеты по звонкам и сообщениям генерируются...', 'success');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчетов', 'error');
    }
}

async function generateDebtorsReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Генерация отчета по должникам...', 'info');
    
    try {
        const url = `/api/reports/test/pdf?type=debtors&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = `Отчет_по_должникам_${startDate || 'все'}_${endDate || 'время'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по должникам генерируется...', 'success');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}

// Генерация отчета по оплатам
async function generatePaymentsReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Генерация отчета по оплатам...', 'info');
    
    try {
        const url = `/api/reports/test/pdf?type=payments&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = `Отчет_по_оплатам_${startDate || 'все'}_${endDate || 'время'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Отчет по оплатам генерируется...', 'success');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}
// Генерация полного отчета
async function generateFullReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const includeCurrent = document.getElementById('reportIncludeCurrentMonth').checked;
    
    showNotification('Генерация полного отчета. Это может занять некоторое время...', 'info');
    
    try {
        const url = `/api/reports/test/pdf?type=full&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = `Полный_отчет_${startDate || 'все'}_${endDate || 'время'}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Полный отчет генерируется...', 'success');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}

// Тестовая функция для проверки PDF
async function testPDF() {
    try {
        showNotification('Генерация тестового отчета...', 'info');
        
        // Показываем прогресс
        const notification = document.getElementById('notification');
        notification.innerHTML = `
            <div class="notification-content">
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    <span>Генерация тестового PDF отчета...</span>
                </div>
            </div>
        `;
        notification.className = 'notification show';
        
        // Используем тестовый эндпоинт
        const response = await fetch('/api/reports/test/pdf?type=test');
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        // Получаем blob
        const blob = await response.blob();
        
        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Тестовый_отчет_${new Date().toISOString().split('T')[0]}.pdf`;
        
        // Добавляем ссылку в DOM и кликаем
        document.body.appendChild(link);
        link.click();
        
        // Очищаем
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Тестовый отчет успешно сгенерирован и скачан', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка тестирования PDF:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}


// Комплексная проверка
async function runDiagnostics() {
    const modal = `
        <div class="modal fade" id="diagnosticsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-stethoscope me-2"></i>
                            Диагностика системы
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="diagnosticsResults">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status"></div>
                                <p class="mt-2">Проверка системы...</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        <button type="button" class="btn btn-primary" onclick="runDiagnostics()">
                            <i class="fas fa-redo me-1"></i>Повторить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Добавляем модальное окно в DOM
    if (!document.getElementById('diagnosticsModal')) {
        document.body.insertAdjacentHTML('beforeend', modal);
    }
    
    const diagnosticsModal = new bootstrap.Modal(document.getElementById('diagnosticsModal'));
    diagnosticsModal.show();
    
    const resultsDiv = document.getElementById('diagnosticsResults');
    
    // Выполняем проверки
    const checks = [
        { name: 'Соединение с сервером', func: checkServerConnection },
        { name: 'API отчетов', func: checkReportsAPI }
    ];
    
    let resultsHTML = '<div class="list-group">';
    
    for (const check of checks) {
        resultsHTML += `
            <div class="list-group-item">
                <div class="d-flex justify-content-between align-items-center">
                    <span>${check.name}</span>
                    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                </div>
            </div>
        `;
    }
    
    resultsHTML += '</div>';
    resultsDiv.innerHTML = resultsHTML;
    
    // Обновляем результаты по мере выполнения
    for (let i = 0; i < checks.length; i++) {
        setTimeout(async () => {
            const success = await checks[i].func();
            const items = resultsDiv.querySelectorAll('.list-group-item');
            const item = items[i];
            
            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <span>${checks[i].name}</span>
                    <span class="badge bg-${success ? 'success' : 'danger'}">
                        ${success ? '✓' : '✗'}
                    </span>
                </div>
            `;
        }, i * 1000);
    }
}
// Тестовая функция для проверки PDF
// Тестовая функция для проверки PDF
async function testPDF() {
    try {
        showNotification('Генерация тестового отчета...', 'info');
        
        // Показываем прогресс
        const notification = document.getElementById('notification');
        notification.innerHTML = `
            <div class="notification-content">
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    <span>Генерация тестового PDF отчета...</span>
                </div>
            </div>
        `;
        notification.className = 'notification show';
        
        // Используем fetch для получения файла
        const response = await fetch('/api/reports/test/pdf');
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        // Получаем blob
        const blob = await response.blob();
        
        // Проверяем, что это действительно PDF
        if (blob.type !== 'application/pdf') {
            console.error('Получен не PDF файл:', blob.type);
            const text = await blob.text();
            console.error('Содержимое:', text.substring(0, 200));
            throw new Error('Сервер вернул не PDF файл');
        }
        
        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Тестовый_отчет_${new Date().toISOString().split('T')[0]}.pdf`;
        
        // Добавляем ссылку в DOM и кликаем
        document.body.appendChild(link);
        link.click();
        
        // Очищаем
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Тестовый отчет успешно сгенерирован и скачан', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка тестирования PDF:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
        
        // Показываем детали ошибки
        if (error.message.includes('Сервер вернул не PDF файл')) {
            setTimeout(() => {
                alert('Сервер вернул не PDF файл. Проверьте консоль для деталей.');
            }, 500);
        }
    }
}
// Генерация отчета по звонкам и сообщениям
async function generateCallsMessagesReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Начинаю генерацию отчета по звонкам и сообщениям...', 'info');
    
    try {
        // Здесь будет реальный запрос к серверу
        const mockPdfData = `
            Отчет по звонкам и сообщениям
            Период: ${startDate} - ${endDate}
            Всего звонков: 2500
            Всего сообщений: 1800
            Общая стоимость: 1250 BYN
        `;
        
        const blob = new Blob([mockPdfData], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Отчет_по_звонкам_сообщениям_${startDate}_${endDate}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showNotification('Отчет по звонкам и сообщениям успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}

// Генерация отчета по должникам
async function generateDebtorsReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Начинаю генерацию отчета по должникам...', 'info');
    
    try {
        const mockPdfData = `
            Отчет по должникам
            Период: ${startDate} - ${endDate}
            Количество должников: 45
            Общая сумма долга: 2250 BYN
            Средний долг: 50 BYN
        `;
        
        const blob = new Blob([mockPdfData], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Отчет_по_должникам_${startDate}_${endDate}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showNotification('Отчет по должникам успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}

// Генерация отчета по оплатам
async function generatePaymentsReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    showNotification('Начинаю генерацию отчета по оплатам...', 'info');
    
    try {
        const mockPdfData = `
            Отчет по оплатам
            Период: ${startDate} - ${endDate}
            Всего платежей: 320
            Общая сумма: 15,000 BYN
            Средний платеж: 46.88 BYN
        `;
        
        const blob = new Blob([mockPdfData], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Отчет_по_оплатам_${startDate}_${endDate}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showNotification('Отчет по оплатам успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}

// Генерация полного отчета
async function generateFullReport() {
    if (!validateReportDates()) return;
    
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const includeCurrent = document.getElementById('reportIncludeCurrentMonth').checked;
    
    showNotification('Начинаю генерацию полного отчета. Это может занять некоторое время...', 'info');
    
    try {
        const mockPdfData = `
            Полный отчет
            Период: ${startDate} - ${endDate}
            
            Раздел 1: Пользователи
            Всего пользователей: 150
            Активных: 120
            Должников: 30
            
            Раздел 2: Звонки и сообщения
            Всего звонков: 2500
            Всего сообщений: 1800
            
            Раздел 3: Финансы
            Общая задолженность: 1500 BYN
            Общие платежи: 15,000 BYN
        `;
        
        const blob = new Blob([mockPdfData], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Полный_отчет_${startDate}_${endDate}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showNotification('Полный отчет успешно сгенерирован', 'success');
        
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при генерации отчета', 'error');
    }
}

// Валидация дат отчета
function validateReportDates() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    if (!startDate || !endDate) {
        showNotification('Пожалуйста, заполните обе даты', 'error');
        return false;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Дата начала не может быть позже даты окончания', 'error');
        return false;
    }
    
    return true;
}

// Вспомогательные функции для дат
function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    
    return [year, month, day].join('-');
}

function formatDateTime(date) {
    const d = new Date(date);
    return d.toLocaleString('ru-RU');
}

// Заглушки для функций отчетов (для тестирования)
function downloadReport(id) {
    showNotification('Функция скачивания отчета в разработке', 'info');
}

function deleteReport(id) {
    if (confirm('Удалить этот отчет?')) {
        showNotification('Отчет удален', 'success');
        loadReportHistory();
    }
}

function clearReportHistory() {
    if (confirm('Очистить всю историю отчетов?')) {
        showNotification('История отчетов очищена', 'success');
        loadReportHistory();
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
        const serviceCheckboxes = document.querySelectorAll('#availableServices input[type="checkbox"]:checked');
        
        serviceCheckboxes.forEach(checkbox => {
            selectedServices.push(checkbox.value);
        });
        
        showNotification('Обновление услуг...', 'warning');
        
        const response = await fetch('/api/admin/user/services/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentEditingUser._id,
                services: selectedServices
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Услуги успешно обновлены', 'success');
            
            // Обновляем список услуг
            await loadUserServices();
            
            // Показываем сводку
            const servicesList = selectedServices.map(serviceId => {
                const service = servicesData[serviceId];
                return service ? `${service.name} (${service.price} BYN/мес)` : serviceId;
            }).join(', ');
            
            if (selectedServices.length > 0) {
                const summary = document.createElement('div');
                summary.innerHTML = `
                    <div class="alert alert-success mt-3">
                        <h6><i class="fas fa-check-circle me-2"></i>Услуги обновлены</h6>
                        <p><strong>Подключенные услуги:</strong> ${servicesList}</p>
                        <p class="mb-0"><small>Стоимость будет включена в следующий ежемесячный платеж</small></p>
                    </div>
                `;
                document.getElementById('userServicesTab').appendChild(summary);
                
                setTimeout(() => {
                    if (summary.parentNode) {
                        summary.remove();
                    }
                }, 5000);
            }
        } else {
            showNotification(result.error || 'Ошибка обновления услуг', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка обновления услуг:', error);
        showNotification('Ошибка обновления услуг: ' + error.message, 'error');
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
            const currentBalance = parseFloat(currentEditingUser.balance) || 0;
            currentEditingUser.balance = currentBalance + amount;
            
            const balanceElement = document.getElementById('modalUserBalance');
            const newBalance = currentEditingUser.balance;
            balanceElement.innerHTML = `<span class="${newBalance >= 0 ? 'text-success' : 'text-danger'} fw-bold">${newBalance.toFixed(2)} BYN</span>`;
            
            // Обновляем доступный кредит
            const creditLimit = parseFloat(currentEditingUser.creditLimit) || 50;
            const availableCredit = Math.max(0, creditLimit + newBalance);
            document.getElementById('modalUserAvailableCredit').innerHTML = 
                `<span class="${availableCredit > 0 ? 'text-success' : 'text-warning'} fw-bold">
                    ${availableCredit.toFixed(2)} BYN
                </span>`;
            
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
            const currentBalance = parseFloat(currentEditingUser.balance) || 0;
            currentEditingUser.balance = currentBalance - amount;
            
            const balanceElement = document.getElementById('modalUserBalance');
            const newBalance = currentEditingUser.balance;
            balanceElement.innerHTML = `<span class="${newBalance >= 0 ? 'text-success' : 'text-danger'} fw-bold">${newBalance.toFixed(2)} BYN</span>`;
            
            // Обновляем доступный кредит
            const creditLimit = parseFloat(currentEditingUser.creditLimit) || 50;
            const availableCredit = Math.max(0, creditLimit + newBalance);
            document.getElementById('modalUserAvailableCredit').innerHTML = 
                `<span class="${availableCredit > 0 ? 'text-success' : 'text-warning'} fw-bold">
                    ${availableCredit.toFixed(2)} BYN
                </span>`;
            
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
            currentEditingUser.tariff = {
                id: userData.tariff,
                name: userData.tariff === 'standard' ? 'Стандарт' : 
                      userData.tariff === 'plus+' ? 'Плюс+' : 
                      userData.tariff === 'Super plus' ? 'Супер плюс' : 'Премиум',
                price: userData.tariff === 'standard' ? 19.99 : 
                       userData.tariff === 'plus+' ? 29.99 : 
                       userData.tariff === 'Super plus' ? 35.99 : 49.99,
                includedMinutes: userData.tariff === 'standard' ? 300 : 
                                userData.tariff === 'plus+' ? 500 : 
                                userData.tariff === 'Super plus' ? 1000 : 2000,
                internetGB: userData.tariff === 'standard' ? 15 : 
                           userData.tariff === 'plus+' ? 25 : 
                           userData.tariff === 'Super plus' ? 50 : 100,
                includedSMS: userData.tariff === 'standard' ? 100 : 
                            userData.tariff === 'plus+' ? 200 : 
                            userData.tariff === 'Super plus' ? 500 : 1000
            };
            
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


async function exportCallsReport() {
    try {
        showNotification('Формирование PDF отчета по звонкам...', 'warning');
        
        const phone = document.getElementById('callsPhoneFilter').value;
        const callType = document.getElementById('callsTypeFilter').value;
        const startDate = document.getElementById('callsStartDate').value;
        const endDate = document.getElementById('callsEndDate').value;
        
        let url = `/api/reports/calls/pdf`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (callType) params.push(`callType=${encodeURIComponent(callType)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        console.log('Запрос PDF отчета по звонкам:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера: ${response.status}. ${errorText}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `calls_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('PDF отчет по звонкам успешно сформирован и скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по звонкам:', error);
        showNotification(`Ошибка формирования отчета: ${error.message}`, 'error');
    }
}

async function exportInternetReport() {
    try {
        showNotification('Формирование PDF отчета по интернет трафику...', 'warning');
        
        const phone = document.getElementById('callsPhoneFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        let url = `/api/reports/internet/pdf`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        console.log('Запрос PDF отчета по интернету:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера: ${response.status}. ${errorText}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `internet_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('PDF отчет по интернет трафику успешно сформирован и скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по интернету:', error);
        showNotification(`Ошибка формирования отчета: ${error.message}`, 'error');
    }
}

async function exportSMSReport() {
    try {
        showNotification('Формирование PDF отчета по SMS...', 'warning');
        
        const phone = document.getElementById('messagesPhoneFilter').value;
        const direction = document.getElementById('messagesDirectionFilter').value;
        const startDate = document.getElementById('messagesStartDate').value;
        const endDate = document.getElementById('messagesEndDate').value;
        
        let url = `/api/reports/sms/pdf`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (direction) params.push(`direction=${encodeURIComponent(direction)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        console.log('Запрос PDF отчета по SMS:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера: ${response.status}. ${errorText}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `sms_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('PDF отчет по SMS успешно сформирован и скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по SMS:', error);
        showNotification(`Ошибка формирования отчета: ${error.message}`, 'error');
    }
}

async function exportPaymentsReport() {
    try {
        showNotification('Формирование PDF отчета по платежам...', 'warning');
        
        const phone = document.getElementById('callsPhoneFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        let url = `/api/reports/payments/pdf`;
        const params = [];
        
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        console.log('Запрос PDF отчета по платежам:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера: ${response.status}. ${errorText}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `payments_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('PDF отчет по платежам успешно сформирован и скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта отчета по платежам:', error);
        showNotification(`Ошибка формирования отчета: ${error.message}`, 'error');
    }
}

async function exportFullReport() {
    try {
        showNotification('Формирование полного PDF отчета...', 'warning');
        
        // Используем даты из фильтров отчетов
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        
        if (!startDate || !endDate) {
            showNotification('Необходимо указать обе даты в фильтрах отчетов', 'error');
            return;
        }
        
        let url = `/api/reports/full/pdf?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        
        console.log('Запрос полного PDF отчета:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера: ${response.status}. ${errorText}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `full_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('Полный PDF отчет успешно сформирован и скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта полного отчета:', error);
        showNotification(`Ошибка формирования отчета: ${error.message}`, 'error');
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

// Обновление состояния чекбоксов
function updateServicesCheckboxes(userServices = []) {
    document.querySelectorAll('#availableServices input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = userServices.includes(checkbox.value);
        
        // Добавляем обработчик для визуальной обратной связи
        checkbox.addEventListener('change', function() {
            const serviceId = this.value;
            const service = servicesData[serviceId];
            const label = this.closest('.form-check').querySelector('.form-check-label');
            
            if (this.checked) {
                label.classList.add('text-success');
                label.classList.remove('text-muted');
            } else {
                label.classList.remove('text-success');
                label.classList.add('text-muted');
            }
        });
    });
}

// Получение названия категории
function getCategoryName(categoryKey) {
    const categoryNames = {
        'связь': 'Услуги связи',
        'защита': 'Защита и безопасность',
        'развлечения': 'Развлечения',
        'хранилище': 'Хранилище',
        'информация': 'Информационные услуги'
    };
    return categoryNames[categoryKey] || categoryKey;
}

// Получение иконки для категории
function getCategoryIcon(category) {
    const icons = {
        'связь': 'phone',
        'защита': 'shield-alt',
        'развлечения': 'gamepad',
        'хранилище': 'cloud',
        'информация': 'newspaper'
    };
    return icons[category] || 'cog';
}

// Инициализация чекбоксов услуг
function initializeServicesCheckboxes() {
    const availableServicesContainer = document.getElementById('availableServices');
    
    // Создаем HTML для чекбоксов с группировкой по категориям
    const categories = {};
    
    Object.keys(servicesData).forEach(serviceId => {
        const service = servicesData[serviceId];
        if (!categories[service.category]) {
            categories[service.category] = [];
        }
        categories[service.category].push({ id: serviceId, ...service });
    });
    
    let servicesHTML = '';
    
    Object.keys(categories).forEach(category => {
        const categoryServices = categories[category];
        
        servicesHTML += `
            <div class="col-12 mb-4">
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0">
                            <i class="fas fa-${getCategoryIcon(category)} me-2"></i>
                            ${getCategoryName(category)}
                            <span class="badge bg-secondary float-end">${categoryServices.length}</span>
                        </h6>
                    </div>
                    <div class="card-body">
                        <div class="row g-3">
                            ${categoryServices.map(service => `
                                <div class="col-md-6">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" 
                                               id="service_${service.id}" 
                                               value="${service.id}">
                                        <label class="form-check-label" for="service_${service.id}">
                                            <strong>${service.name}</strong><br>
                                            <small class="text-muted">${service.description}</small><br>
                                            <span class="badge bg-success">${service.price} BYN/мес</span>
                                        </label>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    availableServicesContainer.innerHTML = servicesHTML;
}