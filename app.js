// 全局变量
let salesData = []; // 保存所有销售数据
let unsubscribe = null; // Firebase实时监听取消函数

// DOM元素加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    // 初始化应用
    initApp();
});

// 初始化应用
async function initApp() {
    console.log('正在初始化应用...');
    try {
        // 设置当前日期
        document.getElementById('date').valueAsDate = new Date();
        
        // 设置事件监听器
        setupEventListeners();
        
        // 检测是否为移动设备并优化布局
        optimizeForMobile();
        
        // 导出显示通知函数给Firebase模块使用
        window.appShowNotification = showNotification;
        
        // 初始化Firebase并设置数据同步
        await initializeFirebase();
        
        // 设置实时数据同步
        await setupDataSync();
        
        // 隐藏加载屏幕
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 1000);
    } catch (error) {
        console.error('应用初始化失败:', error);
        showNotification('应用初始化失败: ' + error.message, 'error');
        
        // 隐藏加载屏幕，显示错误
        document.getElementById('loading-screen').style.display = 'none';
    }
}

// 检测并优化移动设备布局
function optimizeForMobile() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        // 移动端优化调整
        document.body.classList.add('mobile-view');
        console.log('检测到移动设备，已优化界面');
    }
    
    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        const isMobileNow = window.innerWidth <= 768;
        if (isMobileNow) {
            document.body.classList.add('mobile-view');
        } else {
            document.body.classList.remove('mobile-view');
        }
    });
}

// 设置事件监听器
function setupEventListeners() {
    // 表单提交事件
    document.getElementById('sales-form').addEventListener('submit', handleFormSubmit);
    
    // 重置表单按钮
    document.getElementById('reset-form').addEventListener('click', resetForm);
    
    // 导出数据按钮
    document.getElementById('export-data').addEventListener('click', exportData);
    
    // 确认对话框按钮
    document.getElementById('confirm-yes').addEventListener('click', () => {
        const callback = window.confirmCallback;
        hideConfirmDialog();
        if (callback) callback();
    });
    
    document.getElementById('confirm-no').addEventListener('click', hideConfirmDialog);
    document.getElementById('close-confirm').addEventListener('click', hideConfirmDialog);
}

// 处理表单提交
async function handleFormSubmit(e) {
    e.preventDefault();
    
    try {
        // 获取表单数据
        const dateInput = document.getElementById('date').value;
        const salesInput = parseFloat(document.getElementById('sales').value);
        const wechatInput = parseInt(document.getElementById('wechat').value);
        const samplesInput = parseInt(document.getElementById('samples').value);
        const notesInput = document.getElementById('notes').value;
        
        // 验证数据
        if (!dateInput || isNaN(salesInput) || isNaN(wechatInput) || isNaN(samplesInput)) {
            showNotification('请填写所有必填字段', 'error');
            return;
        }
        
        // 准备数据对象
        const formData = {
            date: dateInput,
            sales: salesInput,
            wechat: wechatInput,
            samples: samplesInput,
            notes: notesInput || '',
            timestamp: new Date().toISOString()
        };
        
        // 检查是否已存在同一天的数据
        const existingDataIndex = salesData.findIndex(item => item.date === dateInput);
        
        if (existingDataIndex >= 0) {
            // 如果已存在，询问是否覆盖
            showConfirmDialog(
                '数据已存在',
                `${dateInput} 的数据已存在，是否覆盖？`,
                async () => {
                    // 更新数据
                    await updateSalesRecord(salesData[existingDataIndex].id, formData);
                    resetForm();
                }
            );
        } else {
            // 添加新数据
            await addSalesRecord(formData);
            resetForm();
        }
    } catch (error) {
        console.error('保存数据失败:', error);
        showNotification('保存数据失败: ' + error.message, 'error');
    }
}

// 重置表单
function resetForm() {
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('sales').value = '';
    document.getElementById('wechat').value = '';
    document.getElementById('samples').value = '';
    document.getElementById('notes').value = '';
}

// 设置数据同步
async function setupDataSync() {
    try {
        console.log('设置数据同步...');
        
        // 确保 Firebase 已初始化
        if (!window.firebase) {
            throw new Error('Firebase 未初始化');
        }
        
        // 取消之前的监听（如果有）
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        
        // 从 firebase-config.js 获取实时数据监听函数
        unsubscribe = setupRealtimeListener(data => {
            console.log('收到数据更新，共' + data.length + '条记录');
            salesData = data;
            updateUI();
        });
        
        if (!unsubscribe) {
            throw new Error('无法设置数据同步');
        }
        
        console.log('数据同步设置成功');
        showNotification('数据同步已启动');
        
    } catch (error) {
        console.error('设置数据同步失败:', error);
        showNotification('数据同步失败: ' + error.message, 'error');
        throw error; // 向上传播错误
    }
}

// 更新UI
function updateUI() {
    updateMonthlyStats();
    renderRecentData();
    renderTable();
}

// 更新月度统计数据
function updateMonthlyStats() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // 筛选本月数据
    const monthlyData = salesData.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
    });
    
    // 计算总计
    const totalSales = monthlyData.reduce((sum, item) => sum + item.sales, 0);
    const totalWechat = monthlyData.reduce((sum, item) => sum + item.wechat, 0);
    const totalSamples = monthlyData.reduce((sum, item) => sum + item.samples, 0);
    
    // 更新UI
    document.getElementById('monthly-sales').textContent = `¥${totalSales.toFixed(2)}`;
    document.getElementById('monthly-wechat').textContent = `${totalWechat}人`;
    document.getElementById('monthly-samples').textContent = `${totalSamples}份`;
}

// 渲染近三天数据
function renderRecentData() {
    const recentDataContainer = document.getElementById('recent-data');
    
    // 如果没有数据
    if (!salesData.length) {
        recentDataContainer.innerHTML = '<div class="no-data">暂无销售数据</div>';
        return;
    }
    
    // 获取最近三天的数据
    const recentData = salesData.slice(0, 3);
    
    // 构建HTML
    let html = '';
    
    recentData.forEach(item => {
        const date = new Date(item.date);
        const formattedDate = date.toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric'
        });
        
        html += `
            <div class="recent-day">
                <div class="recent-day-header">
                    <div class="recent-day-date">${formattedDate}</div>
                </div>
                <div class="recent-day-info">
                    <div class="recent-day-item">
                        <span class="recent-day-item-label">销售额:</span>
                        <span>¥${item.sales.toFixed(2)}</span>
                    </div>
                    <div class="recent-day-item">
                        <span class="recent-day-item-label">微信添加:</span>
                        <span>${item.wechat}人</span>
                    </div>
                    <div class="recent-day-item">
                        <span class="recent-day-item-label">样品发出:</span>
                        <span>${item.samples}份</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    recentDataContainer.innerHTML = html;
}

// 渲染数据表格
function renderTable() {
    const tableBody = document.getElementById('data-table-body');
    
    // 如果没有数据
    if (!salesData.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="no-data">暂无销售数据</td>
            </tr>
        `;
        return;
    }
    
    // 构建表格行
    let html = '';
    
    salesData.forEach(item => {
        // 格式化日期
        const date = new Date(item.date);
        const formattedDate = date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        html += `
            <tr data-id="${item.id}">
                <td>${formattedDate}</td>
                <td>¥${item.sales.toFixed(2)}</td>
                <td>${item.wechat}人</td>
                <td>${item.samples}份</td>
                <td>${item.notes || '-'}</td>
                <td>
                    <button class="action-btn edit-btn" data-id="${item.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${item.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    
    // 添加编辑和删除按钮的事件
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', handleEdit);
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', handleDelete);
    });
}

// 处理编辑按钮点击
function handleEdit(e) {
    const id = e.currentTarget.getAttribute('data-id');
    const item = salesData.find(data => data.id === id);
    
    if (!item) return;
    
    // 填充表单
    document.getElementById('date').value = item.date;
    document.getElementById('sales').value = item.sales;
    document.getElementById('wechat').value = item.wechat;
    document.getElementById('samples').value = item.samples;
    document.getElementById('notes').value = item.notes || '';
    
    // 滚动到表单
    document.querySelector('.data-form-section').scrollIntoView({ behavior: 'smooth' });
}

// 处理删除按钮点击
function handleDelete(e) {
    const id = e.currentTarget.getAttribute('data-id');
    const item = salesData.find(data => data.id === id);
    
    if (!item) return;
    
    // 日期格式化
    const date = new Date(item.date);
    const formattedDate = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // 显示确认对话框
    showConfirmDialog(
        '确认删除',
        `确定要删除 ${formattedDate} 的数据吗？此操作不可恢复。`,
        async () => {
            try {
                await deleteSalesRecord(id);
            } catch (error) {
                console.error('删除数据失败:', error);
                showNotification('删除数据失败: ' + error.message, 'error');
            }
        }
    );
}

// 导出数据
function exportData() {
    try {
        if (salesData.length === 0) {
            showNotification('没有数据可导出', 'error');
            return;
        }
        
        // 创建CSV内容
        let csvContent = '日期,销售额,微信添加量,样品发出量,备注\n';
        
        salesData.forEach(item => {
            const row = [
                item.date,
                item.sales,
                item.wechat,
                item.samples,
                `"${(item.notes || '').replace(/"/g, '""')}"`
            ].join(',');
            
            csvContent += row + '\n';
        });
        
        // 创建下载链接
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        // 设置文件名（当前日期）
        const now = new Date();
        const fileName = `销售数据_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.csv`;
        
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('数据导出成功');
    } catch (error) {
        console.error('导出数据失败:', error);
        showNotification('导出数据失败: ' + error.message, 'error');
    }
}

// 显示确认对话框
function showConfirmDialog(title, message, confirmCallback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    // 保存回调
    window.confirmCallback = confirmCallback;
    
    // 显示对话框
    document.getElementById('confirm-dialog').classList.add('show');
}

// 隐藏确认对话框
function hideConfirmDialog() {
    document.getElementById('confirm-dialog').classList.remove('show');
}

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    
    notification.textContent = message;
    notification.className = 'notification ' + type;
    notification.classList.add('show');
    
    // 3秒后自动隐藏
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
} 