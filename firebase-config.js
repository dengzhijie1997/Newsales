// Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyCV4zMfbBwY4jT_qiRLzIAa76dMMH7Ayng",
  authDomain: "coffeesalesdata.firebaseapp.com",
  projectId: "coffeesalesdata",
  storageBucket: "coffeesalesdata.firebasestorage.app",
  messagingSenderId: "678537310070",
  appId: "1:678537310070:web:9d455614e312cf9356d457",
  measurementId: "G-EQCE557XHD"
};

// 全局变量
let app = null;
let analytics = null;
let db = null;
let salesCollection = null;
let isInitialized = false;
let initializeRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;

// 初始化 Firebase
async function initializeFirebase() {
  if (isInitialized) {
    console.log('Firebase 已经初始化');
    return true;
  }

  if (initializeRetryCount >= MAX_RETRY_ATTEMPTS) {
    throw new Error(`初始化失败，已重试 ${MAX_RETRY_ATTEMPTS} 次`);
  }

  try {
    console.log(`开始初始化 Firebase... (尝试 ${initializeRetryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
    
    // 检查 Firebase 模块是否已加载
    const modules = window.firebaseModules;
    if (!modules) {
      throw new Error('Firebase 模块未加载，请检查网络连接');
    }
    
    // 初始化 Firebase 应用
    if (!app) {
      app = modules.initializeApp(firebaseConfig);
      console.log('Firebase 应用初始化成功');
      
      // 初始化 Analytics（可选）
      try {
        analytics = modules.getAnalytics(app);
        console.log('Firebase Analytics 初始化成功');
      } catch (analyticsError) {
        console.warn('Analytics 初始化失败（非关键错误）:', analyticsError);
      }
    }
    
    // 初始化 Firestore
    if (!db) {
      db = modules.getFirestore(app);
      
      // 启用离线持久化
      try {
        await modules.enableIndexedDbPersistence(db);
        console.log('离线持久化已启用');
      } catch (persistenceError) {
        if (persistenceError.code === 'failed-precondition') {
          console.warn('多个标签页打开，离线持久化仅能在一个标签页中启用');
        } else if (persistenceError.code === 'unimplemented') {
          console.warn('当前浏览器不支持离线持久化');
        }
      }
      
      console.log('Firestore 初始化成功');
    }
    
    // 初始化集合引用
    if (!salesCollection) {
      salesCollection = modules.collection(db, 'salesData');
      console.log('销售数据集合已初始化');
    }
    
    // 测试集合访问
    try {
      const testQuery = modules.query(salesCollection, modules.limit(1));
      const testSnapshot = await modules.getDocs(testQuery);
      console.log('集合访问测试成功，当前记录数:', testSnapshot.size);
    } catch (testError) {
      console.error('集合访问测试失败:', testError);
      if (testError.code === 'permission-denied') {
        showNotification('Firebase 权限错误：请检查 Firestore 安全规则', 'error');
      } else {
        showNotification('数据库连接测试失败：' + testError.message, 'error');
      }
      throw testError;
    }
    
    isInitialized = true;
    initializeRetryCount = 0;
    return true;
    
  } catch (error) {
    console.error('Firebase 初始化失败:', error);
    isInitialized = false;
    app = null;
    db = null;
    salesCollection = null;
    initializeRetryCount++;
    
    if (initializeRetryCount < MAX_RETRY_ATTEMPTS) {
      console.log(`将在 3 秒后重试初始化... (${initializeRetryCount}/${MAX_RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return initializeFirebase();
    }
    
    throw error;
  }
}

// 设置实时数据监听
function setupRealtimeListener(callback) {
  if (!isInitialized || !db || !salesCollection) {
    console.error('Firebase 未初始化');
    return null;
  }

  try {
    console.log('设置实时数据监听...');
    const modules = window.firebaseModules;
    
    // 创建查询
    const q = modules.query(
      salesCollection,
      modules.orderBy('date', 'desc')
    );
    
    // 设置监听器
    return modules.onSnapshot(q,
      snapshot => {
        console.log('收到实时数据更新:', snapshot.size + '条记录');
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback(data);
      },
      error => {
        console.error('实时数据监听错误:', error);
        showNotification('数据同步失败: ' + error.message, 'error');
        
        // 如果是权限错误，提供更详细的提示
        if (error.code === 'permission-denied') {
          showNotification('没有访问权限，请检查 Firestore 安全规则', 'error');
        }
      }
    );
  } catch (error) {
    console.error('设置数据监听失败:', error);
    showNotification('无法设置数据监听: ' + error.message, 'error');
    return null;
  }
}

// 获取所有销售数据
async function fetchSalesData() {
  try {
    if (!isInitialized || !db || !salesCollection) {
      throw new Error('Firebase未初始化');
    }
    
    const modules = window.firebaseModules;
    const q = modules.query(
      salesCollection,
      modules.orderBy('date', 'desc')
    );
    
    const snapshot = await modules.getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('获取数据失败:', error);
    showNotification('获取数据失败: ' + error.message, 'error');
    return [];
  }
}

// 添加销售记录
async function addSalesRecord(record) {
  try {
    if (!isInitialized || !db || !salesCollection) {
      throw new Error('Firebase未初始化');
    }
    
    const modules = window.firebaseModules;
    
    // 添加服务器时间戳
    const recordWithTimestamp = {
      ...record,
      createdAt: modules.serverTimestamp(),
      updatedAt: modules.serverTimestamp()
    };
    
    const docRef = await modules.addDoc(salesCollection, recordWithTimestamp);
    showNotification('数据添加成功！');
    return docRef.id;
  } catch (error) {
    console.error('添加数据失败:', error);
    showNotification('添加数据失败: ' + error.message, 'error');
    return null;
  }
}

// 更新销售记录
async function updateSalesRecord(id, updatedRecord) {
  try {
    if (!isInitialized || !db || !salesCollection) {
      throw new Error('Firebase未初始化');
    }
    
    const modules = window.firebaseModules;
    
    // 添加更新时间戳
    const recordWithTimestamp = {
      ...updatedRecord,
      updatedAt: modules.serverTimestamp()
    };
    
    const docRef = modules.doc(db, 'salesData', id);
    await modules.updateDoc(docRef, recordWithTimestamp);
    showNotification('数据更新成功！');
    return true;
  } catch (error) {
    console.error('更新数据失败:', error);
    showNotification('更新数据失败: ' + error.message, 'error');
    return false;
  }
}

// 删除销售记录
async function deleteSalesRecord(id) {
  try {
    if (!isInitialized || !db || !salesCollection) {
      throw new Error('Firebase未初始化');
    }
    
    const modules = window.firebaseModules;
    const docRef = modules.doc(db, 'salesData', id);
    await modules.deleteDoc(docRef);
    showNotification('数据删除成功！');
    return true;
  } catch (error) {
    console.error('删除数据失败:', error);
    showNotification('删除数据失败: ' + error.message, 'error');
    return false;
  }
}

// 显示通知
function showNotification(message, type = 'info') {
  console.log(`[通知 - ${type}]:`, message);
  
  if (typeof window.appShowNotification === 'function') {
    window.appShowNotification(message, type);
    return;
  }
  
  if (type === 'error') {
    alert('错误: ' + message);
  }
}

// 初始化应用
window.addEventListener('load', async () => {
  console.log('页面加载完成，开始初始化 Firebase...');
  try {
    await initializeFirebase();
    console.log('Firebase 初始化成功');
  } catch (error) {
    console.error('Firebase 初始化失败:', error);
    if (typeof window.appShowNotification === 'function') {
      window.appShowNotification('初始化失败: ' + error.message, 'error');
    }
  }
});

// 导出所需的函数
window.initializeFirebase = initializeFirebase;
window.setupRealtimeListener = setupRealtimeListener;
window.addSalesRecord = addSalesRecord;
window.updateSalesRecord = updateSalesRecord;
window.deleteSalesRecord = deleteSalesRecord;
window.fetchSalesData = fetchSalesData; 