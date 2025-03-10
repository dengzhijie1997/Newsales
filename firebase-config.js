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
let db = null;
let salesCollection = null;
let isInitialized = false;
let initializeRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 3000; // 重试延迟时间（毫秒）

// 检查网络连接
async function checkConnection() {
  try {
    const response = await fetch('https://firestore.googleapis.com/', {
      method: 'HEAD',
      mode: 'no-cors'
    });
    return true;
  } catch (error) {
    return false;
  }
}

// 初始化 Firebase
async function initializeFirebase() {
  if (isInitialized && app && db && salesCollection) {
    console.log('Firebase 已经完全初始化');
    return true;
  }

  if (initializeRetryCount >= MAX_RETRY_ATTEMPTS) {
    const error = new Error(`初始化失败，已重试 ${MAX_RETRY_ATTEMPTS} 次`);
    error.code = 'max-retries-exceeded';
    throw error;
  }

  try {
    // 检查网络连接
    const isOnline = await checkConnection();
    if (!isOnline) {
      const error = new Error('无法连接到 Firebase 服务器，请检查网络连接');
      error.code = 'network-error';
      throw error;
    }

    console.log(`开始初始化 Firebase... (尝试 ${initializeRetryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
    
    // 等待确保 Firebase 模块已加载
    let moduleWaitCount = 0;
    while (!window.firebaseModules && moduleWaitCount < 20) {
      await new Promise(resolve => setTimeout(resolve, 500));
      moduleWaitCount++;
      console.log(`等待 Firebase SDK 加载... (${moduleWaitCount}/20)`);
    }
    
    const modules = window.firebaseModules;
    if (!modules) {
      const error = new Error('Firebase SDK 加载失败，请刷新页面重试');
      error.code = 'sdk-load-failed';
      throw error;
    }
    
    // 初始化 Firebase 应用
    if (!app) {
      app = modules.initializeApp(firebaseConfig);
      console.log('Firebase 应用初始化成功');
    }
    
    // 初始化 Firestore
    if (!db) {
      db = modules.getFirestore(app);
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
      console.log('Firebase 连接测试成功，当前记录数:', testSnapshot.size);
    } catch (testError) {
      console.error('Firebase 连接测试失败:', testError);
      if (testError.code === 'permission-denied') {
        const error = new Error('没有访问权限，请检查 Firestore 安全规则');
        error.code = 'permission-denied';
        throw error;
      } else {
        throw testError;
      }
    }
    
    // 所有初始化步骤都成功完成
    isInitialized = true;
    window.firebaseInitialized = true;
    initializeRetryCount = 0;
    console.log('Firebase 完全初始化成功');
    return true;
    
  } catch (error) {
    console.error('Firebase 初始化失败:', error);
    
    // 重置状态
    isInitialized = false;
    window.firebaseInitialized = false;
    
    // 根据错误类型决定是否重试
    if (error.code === 'permission-denied') {
      showNotification('Firebase 访问被拒绝，请检查安全规则', 'error');
      throw error;
    }
    
    if (error.code === 'sdk-load-failed') {
      showNotification('Firebase SDK 加载失败，请检查网络连接', 'error');
      throw error;
    }
    
    // 网络错误或其他可恢复错误时重试
    initializeRetryCount++;
    if (initializeRetryCount < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY * initializeRetryCount; // 递增重试延迟
      console.log(`将在 ${delay/1000} 秒后重试初始化... (${initializeRetryCount}/${MAX_RETRY_ATTEMPTS})`);
      showNotification(`Firebase 连接失败，${delay/1000}秒后重试... (${initializeRetryCount}/${MAX_RETRY_ATTEMPTS})`, 'warning');
      await new Promise(resolve => setTimeout(resolve, delay));
      return initializeFirebase();
    }
    
    throw error;
  }
}

// 设置实时数据监听
function setupRealtimeListener(callback) {
  if (!isInitialized || !window.firebaseInitialized || !db || !salesCollection) {
    throw new Error('Firebase 未完全初始化，请刷新页面重试');
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
        if (error.code === 'permission-denied') {
          showNotification('没有数据访问权限，请检查 Firestore 安全规则', 'error');
        } else {
          showNotification('数据同步失败: ' + error.message, 'error');
          // 尝试重新初始化
          setTimeout(async () => {
            try {
              await initializeFirebase();
            } catch (initError) {
              console.error('重新初始化失败:', initError);
            }
          }, RETRY_DELAY);
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
  if (!isInitialized || !window.firebaseInitialized || !db || !salesCollection) {
    throw new Error('Firebase 未完全初始化，请刷新页面重试');
  }

  try {
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
    if (error.code === 'permission-denied') {
      showNotification('没有数据访问权限，请检查 Firestore 安全规则', 'error');
    } else {
      showNotification('获取数据失败: ' + error.message, 'error');
    }
    return [];
  }
}

// 添加销售记录
async function addSalesRecord(record) {
  if (!isInitialized || !window.firebaseInitialized || !db || !salesCollection) {
    throw new Error('Firebase 未完全初始化，请刷新页面重试');
  }

  try {
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
    if (error.code === 'permission-denied') {
      showNotification('没有添加数据的权限，请检查 Firestore 安全规则', 'error');
    } else {
      showNotification('添加数据失败: ' + error.message, 'error');
    }
    return null;
  }
}

// 更新销售记录
async function updateSalesRecord(id, updatedRecord) {
  if (!isInitialized || !window.firebaseInitialized || !db || !salesCollection) {
    throw new Error('Firebase 未完全初始化，请刷新页面重试');
  }

  try {
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
    if (error.code === 'permission-denied') {
      showNotification('没有更新数据的权限，请检查 Firestore 安全规则', 'error');
    } else {
      showNotification('更新数据失败: ' + error.message, 'error');
    }
    return false;
  }
}

// 删除销售记录
async function deleteSalesRecord(id) {
  if (!isInitialized || !window.firebaseInitialized || !db || !salesCollection) {
    throw new Error('Firebase 未完全初始化，请刷新页面重试');
  }

  try {
    const modules = window.firebaseModules;
    const docRef = modules.doc(db, 'salesData', id);
    await modules.deleteDoc(docRef);
    showNotification('数据删除成功！');
    return true;
  } catch (error) {
    console.error('删除数据失败:', error);
    if (error.code === 'permission-denied') {
      showNotification('没有删除数据的权限，请检查 Firestore 安全规则', 'error');
    } else {
      showNotification('删除数据失败: ' + error.message, 'error');
    }
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

// 确保在页面加载完成后初始化
window.addEventListener('load', async () => {
  console.log('页面加载完成，准备初始化 Firebase...');
  try {
    await initializeFirebase();
  } catch (error) {
    console.error('Firebase 初始化失败:', error);
    showNotification(error.message, 'error');
  }
});

// 导出所需的函数
window.initializeFirebase = initializeFirebase;
window.setupRealtimeListener = setupRealtimeListener;
window.addSalesRecord = addSalesRecord;
window.updateSalesRecord = updateSalesRecord;
window.deleteSalesRecord = deleteSalesRecord;
window.fetchSalesData = fetchSalesData; 