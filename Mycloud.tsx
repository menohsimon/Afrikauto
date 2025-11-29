import React, { useMemo, useState } from 'react';
import {
  Cloud,
  Upload,
  Download,
  Folder,
  File,
  User,
  LogOut,
  CreditCard,
  Share2,
  Trash2,
  Plus,
  X,
  Check
} from 'lucide-react';

type View = 'landing' | 'login' | 'signup' | 'dashboard';
type NotificationType = 'success' | 'error';

interface NotificationState {
  message: string;
  type: NotificationType;
}

interface PricingPlan {
  name: string;
  storage: number;
  price: number;
  features: string[];
}

interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  plan: string;
  storageUsed: number;
  storageLimit: number;
  createdAt: string;
}

interface FileItem {
  id: string;
  userId: string;
  name: string;
  size: number;
  type: string;
  folderId: string | null;
  uploadedAt: string;
}

interface FolderItem {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

const pricingPlans: PricingPlan[] = [
  { name: 'Free', storage: 5, price: 0, features: ['5 GB Storage', 'Basic Support', 'Web Access'] },
  {
    name: 'Basic',
    storage: 50,
    price: 2500,
    features: ['50 GB Storage', 'Priority Support', 'Web & Mobile Access', 'File Sharing']
  },
  {
    name: 'Pro',
    storage: 200,
    price: 8000,
    features: ['200 GB Storage', '24/7 Support', 'Web & Mobile Access', 'Advanced Sharing', 'Version History']
  },
  {
    name: 'Business',
    storage: 1000,
    price: 35000,
    features: [
      '1 TB Storage',
      'Dedicated Support',
      'All Platforms',
      'Team Collaboration',
      'Advanced Security',
      'API Access'
    ]
  }
];

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
};

const MyCloudApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('landing');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [signupData, setSignupData] = useState({ name: '', email: '', password: '' });
  const [loginData, setLoginData] = useState({ email: '', password: '' });

  const showNotification = (message: string, type: NotificationType = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSignup = () => {
    const { name, email, password } = signupData;
    if (!name || !email || !password) {
      showNotification('Please fill all fields', 'error');
      return;
    }

    if (users.some(user => user.email === email)) {
      showNotification('Email already exists', 'error');
      return;
    }

    const newUser: UserAccount = {
      id: crypto.randomUUID(),
      name,
      email,
      password,
      plan: 'Free',
      storageUsed: 0,
      storageLimit: 5 * 1024 * 1024 * 1024,
      createdAt: new Date().toISOString()
    };

    setUsers(prev => [...prev, newUser]);
    setSignupData({ name: '', email: '', password: '' });
    setCurrentView('login');
    showNotification('Account created successfully!');
  };

  const handleLogin = () => {
    const { email, password } = loginData;
    if (!email || !password) {
      showNotification('Please fill all fields', 'error');
      return;
    }

    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      showNotification('Invalid credentials', 'error');
      return;
    }

    setCurrentUser(user);
    setCurrentFolder(null);
    setLoginData({ email: '', password: '' });
    setCurrentView('dashboard');
    showNotification(`Welcome back, ${user.name}!`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('landing');
    setCurrentFolder(null);
    showNotification('Logged out successfully');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    if (currentUser.storageUsed + file.size > currentUser.storageLimit) {
      showNotification('Not enough storage space', 'error');
      return;
    }

    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);

          const newFile: FileItem = {
            id: crypto.randomUUID(),
            userId: currentUser.id,
            name: file.name,
            size: file.size,
            type: file.type,
            folderId: currentFolder,
            uploadedAt: new Date().toISOString()
          };

          setFiles(prev => [...prev, newFile]);
          const updatedUser: UserAccount = {
            ...currentUser,
            storageUsed: currentUser.storageUsed + file.size
          };

          setCurrentUser(updatedUser);
          setUsers(prev => prev.map(u => (u.id === currentUser.id ? updatedUser : u)));
          setShowUploadModal(false);
          setUploadProgress(0);
          showNotification('File uploaded successfully!');
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const createFolder = () => {
    if (!currentUser) return;

    const name = prompt('Enter folder name:');
    if (!name) return;

    const newFolder: FolderItem = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      name,
      parentId: currentFolder,
      createdAt: new Date().toISOString()
    };

    setFolders(prev => [...prev, newFolder]);
    showNotification('Folder created successfully!');
  };

  const deleteFile = (fileId: string) => {
    const fileToDelete = files.find(f => f.id === fileId);
    if (!fileToDelete || !currentUser) return;

    if (confirm('Are you sure you want to delete this file?')) {
      setFiles(prev => prev.filter(f => f.id !== fileId));

      const updatedUser: UserAccount = {
        ...currentUser,
        storageUsed: Math.max(0, currentUser.storageUsed - fileToDelete.size)
      };
      setCurrentUser(updatedUser);
      setUsers(prev => prev.map(u => (u.id === updatedUser.id ? updatedUser : u)));

      showNotification('File deleted successfully!');
    }
  };

  const deleteFolder = (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder?')) return;
    setFolders(prev => prev.filter(folder => folder.id !== folderId));
    setFiles(prev => prev.filter(file => file.folderId !== folderId));
    showNotification('Folder deleted successfully!');
  };

  const upgradePlan = (plan: PricingPlan) => {
    if (!currentUser) return;

    const updatedUser: UserAccount = {
      ...currentUser,
      plan: plan.name,
      storageLimit: plan.storage * 1024 * 1024 * 1024
    };

    setCurrentUser(updatedUser);
    setUsers(prev => prev.map(u => (u.id === currentUser.id ? updatedUser : u)));
    setShowPricingModal(false);
    showNotification(`Upgraded to ${plan.name} plan!`);
  };

  const { userFiles, userFolders } = useMemo(() => {
    if (!currentUser) {
      return { userFiles: [], userFolders: [] };
    }

    const filteredFiles = files.filter(file => file.userId === currentUser.id && file.folderId === currentFolder);
    const filteredFolders = folders.filter(folder => folder.userId === currentUser.id && folder.parentId === currentFolder);

    return { userFiles: filteredFiles, userFolders: filteredFolders };
  }, [files, folders, currentFolder, currentUser]);

  const storagePercent = currentUser ? (currentUser.storageUsed / currentUser.storageLimit) * 100 : 0;

  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        {notification && (
          <div
            className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
              notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'
            } text-white`}
          >
            {notification.message}
          </div>
        )}

        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Cloud className="w-8 h-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-800">MyCloud</span>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setCurrentView('login')} className="px-4 py-2 text-blue-600 hover:text-blue-700">
                Login
              </button>
              <button
                onClick={() => setCurrentView('signup')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Sign Up
              </button>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 py-20">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Your Files, Anywhere, Anytime</h1>
            <p className="text-xl text-gray-600 mb-8">
              Secure cloud storage starting at 0 XAF. Store, share, and access your files from any device.
            </p>
            <button
              onClick={() => setCurrentView('signup')}
              className="px-8 py-4 bg-blue-600 text-white text-lg rounded-lg hover:bg-blue-700 shadow-lg"
            >
              Get Started Free
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Upload className="w-12 h-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Easy Upload</h3>
              <p className="text-gray-600">Drag and drop files or browse to upload instantly</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Share2 className="w-12 h-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Secure Sharing</h3>
              <p className="text-gray-600">Share files securely with anyone, anywhere</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <Cloud className="w-12 h-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Always Available</h3>
              <p className="text-gray-600">Access your files from any device, anytime</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-3xl font-bold text-center mb-8">Choose Your Plan</h2>
            <div className="grid md:grid-cols-4 gap-6">
              {pricingPlans.map(plan => (
                <div key={plan.name} className={`border-2 rounded-lg p-6 ${plan.name === 'Pro' ? 'border-blue-600' : 'border-gray-200'}`}>
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="text-3xl font-bold mb-4">
                    {plan.price === 0 ? 'Free' : `${plan.price.toLocaleString()} XAF`}
                    {plan.price > 0 && <span className="text-sm text-gray-600">/month</span>}
                  </div>
                  <p className="text-gray-600 mb-4">{plan.storage} GB Storage</p>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => setCurrentView('signup')} className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Get Started
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'login' || currentView === 'signup') {
    const isSignup = currentView === 'signup';
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        {notification && (
          <div
            className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
              notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'
            } text-white`}
          >
            {notification.message}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Cloud className="w-10 h-10 text-blue-600" />
            <span className="text-3xl font-bold text-gray-800">MyCloud</span>
          </div>
          <h2 className="text-2xl font-bold text-center mb-6">{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <div className="space-y-4">
            {isSignup && (
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <input
                  type="text"
                  value={signupData.name}
                  onChange={e => setSignupData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={isSignup ? signupData.email : loginData.email}
                onChange={e =>
                  isSignup
                    ? setSignupData(prev => ({ ...prev, email: e.target.value }))
                    : setLoginData(prev => ({ ...prev, email: e.target.value }))
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={isSignup ? signupData.password : loginData.password}
                onChange={e =>
                  isSignup
                    ? setSignupData(prev => ({ ...prev, password: e.target.value }))
                    : setLoginData(prev => ({ ...prev, password: e.target.value }))
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={isSignup ? handleSignup : handleLogin}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              {isSignup ? 'Sign Up' : 'Login'}
            </button>
          </div>
          <p className="text-center mt-4 text-gray-600">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setCurrentView(isSignup ? 'login' : 'signup')}
              className="text-blue-600 hover:underline"
            >
              {isSignup ? 'Login' : 'Sign up'}
            </button>
          </p>
          <button onClick={() => setCurrentView('landing')} className="w-full mt-4 text-gray-600 hover:text-gray-800">
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    setCurrentView('landing');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {notification && (
        <div
          className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
            notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'
          } text-white`}
        >
          {notification.message}
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Upload File</h3>
              <button onClick={() => setShowUploadModal(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <input type="file" onChange={handleFileUpload} className="w-full mb-4" />
            {uploadProgress > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
          </div>
        </div>
      )}

      {showPricingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Upgrade Your Plan</h3>
              <button onClick={() => setShowPricingModal(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {pricingPlans.map(plan => (
                <div
                  key={plan.name}
                  className={`border-2 rounded-lg p-4 ${
                    currentUser.plan === plan.name ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
                  <div className="text-2xl font-bold mb-3">
                    {plan.price === 0 ? 'Free' : `${plan.price.toLocaleString()} XAF`}
                    {plan.price > 0 && <span className="text-xs text-gray-600">/month</span>}
                  </div>
                  <p className="text-gray-600 mb-3 text-sm">{plan.storage} GB Storage</p>
                  <ul className="space-y-1 mb-4">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-center gap-1 text-xs">
                        <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {currentUser.plan === plan.name ? (
                    <button disabled className="w-full py-2 bg-gray-300 text-gray-600 rounded text-sm">
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => upgradePlan(plan)}
                      className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      {plan.price === 0 ? 'Downgrade' : 'Upgrade'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Cloud className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-800">MyCloud</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-gray-600" />
              <span className="text-gray-700">{currentUser.name}</span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded">
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold">Storage Usage</h2>
              <p className="text-gray-600">
                {formatBytes(currentUser.storageUsed)} of {formatBytes(currentUser.storageLimit)} used
              </p>
            </div>
            <button
              onClick={() => setShowPricingModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <CreditCard className="w-5 h-5" />
              Upgrade Plan ({currentUser.plan})
            </button>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full ${storagePercent > 90 ? 'bg-red-600' : storagePercent > 70 ? 'bg-yellow-600' : 'bg-blue-600'}`}
              style={{ width: `${storagePercent}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Upload className="w-5 h-5" />
              Upload File
            </button>
            <button
              onClick={createFolder}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Plus className="w-5 h-5" />
              New Folder
            </button>
            {currentFolder && (
              <button
                onClick={() => setCurrentFolder(null)}
                className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                ← Back
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold mb-4">
            {currentFolder ? folders.find(folder => folder.id === currentFolder)?.name : 'My Files'}
          </h3>

          {userFolders.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-600 mb-3">FOLDERS</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {userFolders.map(folder => (
                  <div key={folder.id} className="border rounded-lg p-4 hover:shadow-md cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <Folder className="w-12 h-12 text-blue-500" onClick={() => setCurrentFolder(folder.id)} />
                      <button onClick={() => deleteFolder(folder.id)} className="opacity-0 group-hover:opacity-100 text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="font-medium truncate" onClick={() => setCurrentFolder(folder.id)}>
                      {folder.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {userFiles.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-3">FILES</h4>
              <div className="space-y-2">
                {userFiles.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md group">
                    <div className="flex items-center gap-4">
                      <File className="w-8 h-8 text-gray-500" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-600">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="Download">
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deleteFile(file.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : userFolders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Cloud className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No files yet. Upload your first file!</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MyCloudApp;


