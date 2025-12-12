let currentFolderId = null;
let currentPlan = 'Free';
let storageUsed = 0;
let storageTotal = 5368709120;
let currentView = 'files';
let currentFilter = 'all';
let deletedFiles = JSON.parse(localStorage.getItem('deletedFiles') || '[]');
let uploadMode = 'file'; // 'file' or 'folder'
let selectedFiles = [];
let userIsActive = true; // Track if user account is active

const plans = {
    'Free': { quota: 5368709120, price: 0, storage: '5 GB' },
    'Basic': { quota: 53687091200, price: 2500, storage: '50 GB' },
    'Pro': { quota: 214748364800, price: 8000, storage: '200 GB' },
    'Business': { quota: 1099511627776, price: 35000, storage: '1 TB' }
};

// Load on page load
window.onload = () => {
    loadTheme();
    setupEventListeners();
    loadStorageInfo();
    // Ensure search input is empty and disabled
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.disabled = true;
    }
    // Start with Home view (shows upload button)
    currentView = 'home';
    navigateTo('home');
};

let searchEnabled = false;

function setupEventListeners() {
    // Search input - only works when enabled
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        if (searchEnabled) {
            filterFilesByName(e.target.value);
        }
    });
    
    // Handle Escape key to disable search
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            disableSearch();
        }
    });
    
    // Clear search when input loses focus and is empty
    searchInput.addEventListener('blur', (e) => {
        if (e.target.value.trim() === '') {
            disableSearch();
        }
    });
    
    // Close user menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-circle') && !e.target.closest('.user-menu')) {
            document.getElementById('userMenu').classList.remove('show');
        }
    });
}

function enableSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchIconBtn = document.getElementById('searchIconBtn');
    
    searchEnabled = true;
    searchInput.disabled = false;
    searchInput.focus();
    searchIconBtn.style.display = 'none'; // Hide icon when search is enabled
}

function disableSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchIconBtn = document.getElementById('searchIconBtn');
    
    searchEnabled = false;
    searchInput.disabled = true;
    searchInput.value = ''; // Clear search input
    searchIconBtn.style.display = 'flex'; // Show icon again
    filterFilesByName(''); // Clear any active filters
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    setTheme(theme);
}

function setTheme(theme) {
    document.body.className = theme === 'dark' ? 'dark-theme' : '';
    localStorage.setItem('theme', theme);
    updateSettingsThemeTab(theme);
}

function updateSettingsThemeTab(theme) {
    const tabs = document.querySelectorAll('.settings-tab[data-tab="theme"]');
    // This will be handled when settings modal opens
}

function navigateTo(view) {
    currentView = view;
    
    // Clear search when navigating
    disableSearch();
    
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === view) {
            item.classList.add('active');
        }
    });
    
    // Show/hide upload button based on view
    const uploadButton = document.getElementById('uploadButton');
    const toolbarSection = document.getElementById('toolbarSection');
    if (view === 'home') {
        // Show upload button only on Home
        if (uploadButton) uploadButton.style.display = 'flex';
        if (toolbarSection) toolbarSection.style.display = 'block';
        currentFolderId = null;
        document.getElementById('breadcrumb').textContent = 'Home';
        loadFiles();
    } else if (view === 'files') {
        // Hide upload button in My Files
        if (uploadButton) uploadButton.style.display = 'none';
        if (toolbarSection) toolbarSection.style.display = 'none';
        currentFolderId = null;
        document.getElementById('breadcrumb').textContent = 'My Files';
        loadFiles();
    } else if (view === 'recycle') {
        // Hide upload button in Recycle Bin
        if (uploadButton) uploadButton.style.display = 'none';
        if (toolbarSection) toolbarSection.style.display = 'none';
        loadRecycleBin();
    } else if (view === 'admin') {
        window.location.href = '/admin/login';
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    menu.classList.toggle('show');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function loadStorageInfo() {
    try {
        const response = await fetch('/api/storage/info');
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Storage info error:', errorData);
            showNotification('Failed to load storage info: ' + (errorData.error || 'Unknown error'), 'error');
            return;
        }
        
        const data = await response.json();

        if (!data || data.error) {
            showNotification('Failed to load storage info: ' + (data.error || 'Unknown error'), 'error');
            return;
        }

        storageUsed = data.storage_used || 0;
        storageTotal = data.storage_quota || 5368709120;
        currentPlan = data.plan || 'Free';
        userIsActive = data.is_active !== undefined ? data.is_active : true;

        // Update UI based on active status
        updateUIForActiveStatus();

        // Update top bar (if elements exist)
        const storageUsedEl = document.getElementById('storageUsed');
        const storageTotalEl = document.getElementById('storageTotal');
        if (storageUsedEl) storageUsedEl.textContent = formatBytes(storageUsed);
        if (storageTotalEl) storageTotalEl.textContent = formatBytes(storageTotal);

        // Update sidebar
        document.getElementById('storageUsedSidebar').textContent = formatBytes(storageUsed);
        document.getElementById('storageTotalSidebar').textContent = formatBytes(storageTotal);
        
        const percent = data.storage_percent || 0;
        document.getElementById('storagePercentSidebar').textContent = percent.toFixed(1) + '%';
        
        const progressBar = document.getElementById('storageProgressSidebar');
        progressBar.style.width = percent + '%';

        // Update settings panel (if modal is open)
        const settingsStorageUsed = document.getElementById('settingsStorageUsed');
        const settingsStorageTotal = document.getElementById('settingsStorageTotal');
        const settingsStorageAvailable = document.getElementById('settingsStorageAvailable');
        const settingsStoragePercent = document.getElementById('settingsStoragePercent');
        const settingsStorageProgress = document.getElementById('settingsStorageProgress');
        
        if (settingsStorageUsed) settingsStorageUsed.textContent = formatBytes(storageUsed);
        if (settingsStorageTotal) settingsStorageTotal.textContent = formatBytes(storageTotal);
        if (settingsStorageAvailable) settingsStorageAvailable.textContent = formatBytes(storageTotal - storageUsed);
        if (settingsStoragePercent) settingsStoragePercent.textContent = percent.toFixed(1) + '% used';
        if (settingsStorageProgress) settingsStorageProgress.style.width = percent + '%';

        if (percent >= 90) {
            progressBar.style.background = '#d13438';
        } else if (percent >= 70) {
            progressBar.style.background = '#ff8c00';
        } else {
            progressBar.style.background = 'var(--accent-color)';
        }
    } catch (error) {
        console.error('Error loading storage info:', error);
        showNotification('Failed to load storage info: ' + error.message, 'error');
    }
}

function updateUIForActiveStatus() {
    // Show/hide warning banner
    let warningBanner = document.getElementById('accountDeactivatedBanner');
    if (!warningBanner) {
        warningBanner = document.createElement('div');
        warningBanner.id = 'accountDeactivatedBanner';
        warningBanner.style.cssText = 'background: #d13438; color: white; padding: 12px 20px; text-align: center; font-weight: 500; position: sticky; top: 0; z-index: 1000;';
        warningBanner.innerHTML = '⚠️ Your account has been deactivated. You can view your files but cannot perform actions like uploading, deleting, or changing settings. Please contact the administrator.';
        document.body.insertBefore(warningBanner, document.body.firstChild);
    }
    
    if (!userIsActive) {
        warningBanner.style.display = 'block';
        
        // Disable upload button
        const uploadButton = document.getElementById('uploadButton');
        if (uploadButton) {
            uploadButton.style.opacity = '0.5';
            uploadButton.style.pointerEvents = 'none';
            uploadButton.title = 'Account deactivated - Upload disabled';
        }
        
        // Disable upgrade button
        const upgradeButton = document.querySelector('.btn-upgrade-sidebar');
        if (upgradeButton) {
            upgradeButton.style.opacity = '0.5';
            upgradeButton.style.pointerEvents = 'none';
            upgradeButton.title = 'Account deactivated - Upgrade disabled';
        }
    } else {
        warningBanner.style.display = 'none';
        
        // Re-enable buttons
        const uploadButton = document.getElementById('uploadButton');
        if (uploadButton) {
            uploadButton.style.opacity = '1';
            uploadButton.style.pointerEvents = 'auto';
            uploadButton.title = '';
        }
        
        const upgradeButton = document.querySelector('.btn-upgrade-sidebar');
        if (upgradeButton) {
            upgradeButton.style.opacity = '1';
            upgradeButton.style.pointerEvents = 'auto';
            upgradeButton.title = '';
        }
    }
}

async function loadFiles() {
    try {
        const url = currentFolderId ? `/api/storage/files?folder_id=${currentFolderId}` : '/api/storage/files';
        const response = await fetch(url);
        const data = await response.json();

        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '';

        const folders = data.folders || [];
        const files = data.files || [];
        
        // Filter files by type if needed
        let filteredFiles = files;
        if (currentFilter !== 'all' && currentFilter !== 'recent') {
            filteredFiles = files.filter(file => {
                const mime = (file.mime_type || '').toLowerCase();
                if (currentFilter === 'word') return mime.includes('word') || mime.includes('document');
                if (currentFilter === 'excel') return mime.includes('excel') || mime.includes('spreadsheet');
                if (currentFilter === 'powerpoint') return mime.includes('powerpoint') || mime.includes('presentation');
                if (currentFilter === 'pdf') return mime.includes('pdf');
                return false;
            });
        }

        if (folders.length === 0 && filteredFiles.length === 0) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📂</div>
                    <p>No files yet. Upload your first file!</p>
                </div>
            `;
            return;
        }

        // Group files by type
        const filesByType = {};
        filteredFiles.forEach(file => {
            const type = getFileType(file.mime_type);
            if (!filesByType[type]) {
                filesByType[type] = [];
            }
            filesByType[type].push(file);
        });

        // Render folders
        if (folders.length > 0) {
            const folderSection = document.createElement('div');
            folderSection.className = 'file-type-section';
            folderSection.innerHTML = `
                <div class="file-type-header">📁 Folders</div>
                <div class="files-grid" id="foldersGrid"></div>
            `;
            filesList.appendChild(folderSection);
            
            const foldersGrid = document.getElementById('foldersGrid');
            folders.forEach(folder => {
                const folderEl = createFolderElement(folder);
                foldersGrid.appendChild(folderEl);
            });
        }

        // Render files by type
        Object.keys(filesByType).forEach(type => {
            const section = document.createElement('div');
            section.className = 'file-type-section';
            section.innerHTML = `
                <div class="file-type-header">${getFileTypeIcon(type)} ${type} Documents</div>
                <div class="files-grid" id="${type}Grid"></div>
            `;
            filesList.appendChild(section);
            
            const grid = document.getElementById(`${type}Grid`);
            filesByType[type].forEach(file => {
                const fileEl = createFileElement(file);
                grid.appendChild(fileEl);
            });
        });

    } catch (error) {
        showNotification('Failed to load files', 'error');
    }
}

function getFileType(mimeType) {
    if (!mimeType) return 'Other';
    const mime = mimeType.toLowerCase();
    if (mime.includes('word') || mime.includes('document')) return 'Word';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return 'Excel';
    if (mime.includes('powerpoint') || mime.includes('presentation')) return 'PowerPoint';
    if (mime.includes('pdf')) return 'PDF';
    if (mime.startsWith('image/')) return 'Image';
    if (mime.startsWith('video/')) return 'Video';
    return 'Other';
}

function getFileTypeIcon(type) {
    const icons = {
        'Word': '📘',
        'Excel': '📊',
        'PowerPoint': '📽️',
        'PDF': '📕',
        'Image': '🖼️',
        'Video': '🎥',
        'Other': '📄'
    };
    return icons[type] || '📄';
}

function createFolderElement(folder) {
    const folderEl = document.createElement('div');
    folderEl.className = 'folder-item';
    folderEl.innerHTML = `
        <div class="folder-icon">📁</div>
        <div class="folder-name">${folder.name}</div>
        <div class="file-actions">
            <button class="btn-icon-small btn-delete" onclick="deleteFolder('${folder._id}'); event.stopPropagation();">🗑️</button>
        </div>
    `;
    folderEl.onclick = () => openFolder(folder._id, folder.name);
    return folderEl;
}

function createFileElement(file) {
    const fileEl = document.createElement('div');
    fileEl.className = 'file-item';
    const icon = getFileIcon(file.mime_type);
    const deleteDisabled = !userIsActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;" title="Account deactivated"' : '';
    fileEl.innerHTML = `
        <div class="file-icon">${icon}</div>
        <div class="file-name">${file.original_name || file.name}</div>
        <div class="file-size">${formatBytes(file.size)}</div>
        <div class="file-actions">
            <button class="btn-icon-small" onclick="downloadFile('${file._id}', '${file.original_name || file.name}'); event.stopPropagation();">⬇️</button>
            <button class="btn-icon-small btn-delete" onclick="deleteFile('${file._id}'); event.stopPropagation();" ${deleteDisabled}>🗑️</button>
        </div>
    `;
    return fileEl;
}

function getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    return '📄';
}

function filterFiles(type) {
    currentFilter = type;
    
    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === type) {
            btn.classList.add('active');
        }
    });
    
    loadFiles();
}

function filterFilesByName(query) {
    const fileItems = document.querySelectorAll('.file-item, .folder-item');
    fileItems.forEach(item => {
        const name = item.querySelector('.file-name, .folder-name').textContent.toLowerCase();
        if (name.includes(query.toLowerCase())) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function openFolder(folderId, folderName) {
    currentFolderId = folderId;
    document.getElementById('breadcrumb').textContent = `My Files / ${folderName}`;
    loadFiles();
}

function goBack() {
    currentFolderId = null;
    document.getElementById('breadcrumb').textContent = 'My Files';
    loadFiles();
}

async function loadRecycleBin() {
    const filesList = document.getElementById('filesList');
    filesList.innerHTML = '';
    
    if (deletedFiles.length === 0) {
        filesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🗑️</div>
                <p>Recycle bin is empty</p>
            </div>
        `;
        return;
    }
    
    // Add action buttons at the top
    const actionBar = document.createElement('div');
    actionBar.className = 'recycle-bin-actions';
    actionBar.innerHTML = `
        <button class="btn btn-primary" onclick="restoreAllFiles()">
            ♻️ Restore All
        </button>
        <button class="btn btn-danger" onclick="emptyRecycleBin()">
            🗑️ Empty Bin
        </button>
        <div class="recycle-bin-count">
            ${deletedFiles.length} item(s) in recycle bin
        </div>
    `;
    filesList.appendChild(actionBar);
    
    const grid = document.createElement('div');
    grid.className = 'files-grid';
    
    deletedFiles.forEach((item, index) => {
        const itemEl = createRecycleBinItemElement(item, index);
        grid.appendChild(itemEl);
    });
    
    filesList.appendChild(grid);
}

function createRecycleBinItemElement(item, index) {
    const itemEl = document.createElement('div');
    const isFolder = item.type === 'folder' || item.folder_id === undefined && item.mime_type === undefined;
    
    if (isFolder) {
        itemEl.className = 'folder-item';
        const deletedDate = item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : 'Unknown';
        itemEl.innerHTML = `
            <div class="folder-icon">📁</div>
            <div class="folder-name">${item.name || item.original_name || 'Folder'}</div>
            <div class="folder-type" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Folder</div>
            <div class="file-deleted-date" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Deleted: ${deletedDate}</div>
            <div class="file-actions">
                <button class="btn-icon-small btn-restore" onclick="restoreItem(${index}); event.stopPropagation();" title="Restore folder" ${!userIsActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>♻️</button>
                <button class="btn-icon-small btn-delete" onclick="permanentlyDeleteFile(${index}); event.stopPropagation();" title="Permanently delete" ${!userIsActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>🗑️</button>
            </div>
        `;
    } else {
        itemEl.className = 'file-item';
        const icon = getFileIcon(item.mime_type);
        const deletedDate = item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : 'Unknown';
        itemEl.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name">${item.original_name || item.name}</div>
            <div class="file-size">${formatBytes(item.size || 0)}</div>
            <div class="file-deleted-date" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Deleted: ${deletedDate}</div>
            <div class="file-actions">
                <button class="btn-icon-small btn-restore" onclick="restoreItem(${index}); event.stopPropagation();" title="Restore file" ${!userIsActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>♻️</button>
                <button class="btn-icon-small btn-delete" onclick="permanentlyDeleteFile(${index}); event.stopPropagation();" title="Permanently delete" ${!userIsActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>🗑️</button>
            </div>
        `;
    }
    return itemEl;
}

async function restoreItem(index) {
    const item = deletedFiles[index];
    if (!item) return;
    
    const isFolder = item.type === 'folder' || (item.folder_id === undefined && item.mime_type === undefined);
    const itemType = isFolder ? 'folder' : 'file';
    
    if (!confirm(`Are you sure you want to restore this ${itemType}?`)) return;
    
    try {
        let response;
        if (isFolder) {
            response = await fetch('/api/storage/folder/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_data: item })
            });
        } else {
            response = await fetch('/api/storage/file/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_data: item })
            });
        }

        if (response.ok) {
            const data = await response.json();
            
            // Remove from deleted files
            deletedFiles.splice(index, 1);
            localStorage.setItem('deletedFiles', JSON.stringify(deletedFiles));
            
            // Update storage
            if (data.storage_used !== undefined) {
                storageUsed = data.storage_used;
                storageTotal = data.storage_quota;
            }
            
            showNotification(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} restored successfully`, 'success');
            loadRecycleBin();
            // If on home view, reload files to show restored item
            if (currentView === 'home' || currentView === 'files') {
                loadFiles();
            }
            setTimeout(() => loadStorageInfo(), 500);
        } else {
            const errorData = await response.json();
            showNotification(errorData.error || `Failed to restore ${itemType}`, 'error');
        }
    } catch (error) {
        showNotification(`Failed to restore ${itemType}`, 'error');
    }
}

async function restoreAllFiles() {
    if (!userIsActive) {
        showNotification('Your account has been deactivated. You cannot restore files.', 'error');
        return;
    }
    if (deletedFiles.length === 0) {
        showNotification('Recycle bin is empty', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to restore all ${deletedFiles.length} item(s) from the recycle bin?`)) return;
    
    const itemsToRestore = [...deletedFiles];
    let restored = 0;
    let failed = 0;
    
    document.getElementById('uploadProgress').style.display = 'block';
    
    for (let i = 0; i < itemsToRestore.length; i++) {
        const item = itemsToRestore[i];
        const isFolder = item.type === 'folder' || (item.folder_id === undefined && item.mime_type === undefined);
        
        try {
            let response;
            if (isFolder) {
                response = await fetch('/api/storage/folder/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder_data: item })
                });
            } else {
                response = await fetch('/api/storage/file/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_data: item })
                });
            }
            
            if (response.ok) {
                const data = await response.json();
                if (data.storage_used !== undefined) {
                    storageUsed = data.storage_used;
                    storageTotal = data.storage_quota;
                }
                restored++;
            } else {
                failed++;
            }
            
            // Update progress
            document.getElementById('uploadProgressFill').style.width = 
                ((i + 1) / itemsToRestore.length * 100) + '%';
        } catch (error) {
            failed++;
        }
    }
    
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadProgressFill').style.width = '0%';
    
    // Clear all deleted files
    deletedFiles = [];
    localStorage.setItem('deletedFiles', JSON.stringify(deletedFiles));
    
    if (restored > 0) {
        showNotification(
            `Successfully restored ${restored} item(s)${failed > 0 ? `, ${failed} failed` : ''}`,
            failed > 0 ? 'error' : 'success'
        );
        loadRecycleBin();
        if (currentView === 'home' || currentView === 'files') {
            loadFiles();
        }
        setTimeout(() => loadStorageInfo(), 500);
    } else {
        showNotification('Failed to restore items', 'error');
    }
}

async function emptyRecycleBin() {
    if (deletedFiles.length === 0) {
        showNotification('Recycle bin is already empty', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to permanently delete all ${deletedFiles.length} item(s) from the recycle bin? This action cannot be undone.`)) return;
    
    // Clear all deleted files from localStorage
    deletedFiles = [];
    localStorage.setItem('deletedFiles', JSON.stringify(deletedFiles));
    
    showNotification('Recycle bin emptied successfully', 'success');
    loadRecycleBin();
}

async function permanentlyDeleteFile(index) {
    if (!confirm('Are you sure you want to permanently delete this file? This action cannot be undone.')) return;
    
    const file = deletedFiles[index];
    if (!file) return;
    
    try {
        // Remove from deleted files
        deletedFiles.splice(index, 1);
        localStorage.setItem('deletedFiles', JSON.stringify(deletedFiles));
        
        showNotification('File permanently deleted', 'success');
        loadRecycleBin();
    } catch (error) {
        showNotification('Failed to delete file', 'error');
    }
}

function togglePasswordVisibility(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    
    if (input.type === 'password') {
        input.type = 'text';
        toggle.textContent = '🙈';
    } else {
        input.type = 'password';
        toggle.textContent = '👁️';
    }
}

async function uploadFile() {
    if (!userIsActive) {
        showNotification('Your account has been deactivated. You cannot upload files.', 'error');
        return;
    }
    if (uploadMode === 'folder') {
        await uploadFolder();
    } else {
        await uploadSingleFile();
    }
}

async function uploadSingleFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        showNotification('Please select a file', 'error');
        return;
    }

    if (storageUsed + file.size > storageTotal) {
        showNotification('Not enough storage space. Please upgrade your plan.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId) {
        formData.append('folder_id', currentFolderId);
    }

    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadProgressFill').style.width = '50%';

    try {
        const response = await fetch('/api/storage/upload', {
            method: 'POST',
            body: formData
        });

        document.getElementById('uploadProgressFill').style.width = '100%';

        if (response.ok) {
            const data = await response.json();
            // Update storage immediately from response if available
            if (data.storage_used !== undefined) {
                storageUsed = data.storage_used;
                storageTotal = data.storage_quota;
            }
            showNotification('File uploaded successfully', 'success');
            closeModal('uploadModal');
            loadFiles();
            // Reload storage info to ensure UI is updated
            setTimeout(() => loadStorageInfo(), 500);
            fileInput.value = '';
        } else {
            const data = await response.json();
            showNotification(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showNotification('Upload failed', 'error');
    } finally {
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadProgressFill').style.width = '0%';
    }
}

async function uploadFolder() {
    if (selectedFiles.length === 0) {
        showNotification('Please select a folder', 'error');
        return;
    }

    // Calculate total size
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    
    if (storageUsed + totalSize > storageTotal) {
        showNotification('Not enough storage space. Please upgrade your plan.', 'error');
        return;
    }

    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadStatus').style.display = 'block';
    document.getElementById('uploadBtn').disabled = true;

    let uploaded = 0;
    let failed = 0;
    const total = selectedFiles.length;

    // Process files in batches to avoid overwhelming the server
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const relativePath = file.webkitRelativePath || file.name;
        const pathParts = relativePath.split('/').filter(p => p);
        
        try {
            // Update status
            document.getElementById('uploadStatusText').textContent = 
                `Uploading ${i + 1}/${total}: ${file.name}`;
            document.getElementById('uploadProgressFill').style.width = 
                ((i / total) * 100) + '%';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('relative_path', relativePath);
            if (currentFolderId) {
                formData.append('parent_folder_id', currentFolderId);
            }

            const response = await fetch('/api/storage/upload-folder', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                if (data.storage_used !== undefined) {
                    storageUsed = data.storage_used;
                    storageTotal = data.storage_quota;
                }
                uploaded++;
            } else {
                failed++;
                console.error(`Failed to upload ${file.name}`);
            }
        } catch (error) {
            failed++;
            console.error(`Error uploading ${file.name}:`, error);
        }
    }

    document.getElementById('uploadProgressFill').style.width = '100%';
    document.getElementById('uploadBtn').disabled = false;

    if (uploaded > 0) {
        showNotification(
            `Folder uploaded successfully! ${uploaded} file(s) uploaded${failed > 0 ? `, ${failed} failed` : ''}`,
            failed > 0 ? 'error' : 'success'
        );
        closeModal('uploadModal');
        loadFiles();
        setTimeout(() => loadStorageInfo(), 500);
    } else {
        showNotification('Failed to upload folder', 'error');
    }

    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadStatus').style.display = 'none';
    document.getElementById('uploadProgressFill').style.width = '0%';
    document.getElementById('folderInput').value = '';
    selectedFiles = [];
}

async function createFolder() {
    const folderName = document.getElementById('folderName').value.trim();

    if (!folderName) {
        showNotification('Please enter a folder name', 'error');
        return;
    }

    try {
        const response = await fetch('/api/storage/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_name: folderName,
                parent_id: currentFolderId
            })
        });

        if (response.ok) {
            showNotification('Folder created successfully', 'success');
            closeModal('folderModal');
            loadFiles();
            document.getElementById('folderName').value = '';
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to create folder', 'error');
        }
    } catch (error) {
        showNotification('Failed to create folder', 'error');
    }
}

async function deleteFile(fileId) {
    if (!userIsActive) {
        showNotification('Your account has been deactivated. You cannot delete files.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const deleteResponse = await fetch(`/api/storage/file/${fileId}`, {
            method: 'DELETE'
        });

        if (deleteResponse.ok) {
            const data = await deleteResponse.json();
            
            // Store deleted file data for restore
            if (data.deleted_file) {
                deletedFiles.push({
                    ...data.deleted_file,
                    _id: data.deleted_file.id.toString(),
                    deletedAt: new Date().toISOString()
                });
                localStorage.setItem('deletedFiles', JSON.stringify(deletedFiles));
            }
            
            // Update storage immediately from response if available
            if (data.storage_used !== undefined) {
                storageUsed = data.storage_used;
                storageTotal = data.storage_quota;
            }
            showNotification('File deleted successfully', 'success');
            loadFiles();
            // Reload storage info to ensure UI is updated
            setTimeout(() => loadStorageInfo(), 500);
        } else {
            showNotification('Failed to delete file', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete file', 'error');
    }
}

async function deleteFolder(folderId) {
    if (!userIsActive) {
        showNotification('Your account has been deactivated. You cannot delete folders.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to delete this folder and all its contents?')) return;

    try {
        const response = await fetch(`/api/storage/folder/${folderId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const data = await response.json();
            
            // Store deleted folder data for restore
            if (data.deleted_folder) {
                deletedFiles.push({
                    ...data.deleted_folder,
                    type: 'folder',
                    _id: data.deleted_folder.id.toString(),
                    deletedAt: new Date().toISOString()
                });
                localStorage.setItem('deletedFiles', JSON.stringify(deletedFiles));
            }
            
            // Update storage
            if (data.storage_used !== undefined) {
                storageUsed = data.storage_used;
                storageTotal = data.storage_quota;
            }
            
            showNotification('Folder deleted successfully', 'success');
            loadFiles();
            setTimeout(() => loadStorageInfo(), 500);
        } else {
            showNotification('Failed to delete folder', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete folder', 'error');
    }
}

async function downloadFile(fileId, fileName) {
    try {
        const response = await fetch(`/api/storage/download/${fileId}`);
        const data = await response.json();

        const link = document.createElement('a');
        link.href = `data:${data.mime_type};base64,${data.data}`;
        link.download = fileName;
        link.click();

        showNotification('File downloaded', 'success');
    } catch (error) {
        showNotification('Failed to download file', 'error');
    }
}

function showSettingsModal() {
    closeUserMenu();
    showModal('settingsModal');
    showSettingsTab('storage');
    loadStorageInfo(); // Refresh storage info
}

function showSettingsTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    
    document.querySelector(`.settings-tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Panel`).classList.add('active');
    
    if (tab === 'plans') {
        showUpgradePlans();
    }
}

function showUpgradePlans() {
    const grid = document.getElementById('pricingGrid');
    grid.innerHTML = '';

    Object.entries(plans).forEach(([name, plan]) => {
        const card = document.createElement('div');
        card.className = 'pricing-card';
        if (name === currentPlan) {
            card.classList.add('current');
        }
        card.innerHTML = `
            <div class="plan-name">${name}</div>
            <div class="plan-price">${plan.price === 0 ? 'Free' : plan.price.toLocaleString() + ' XAF'}</div>
            <div class="plan-storage">${plan.storage}</div>
        `;
        if (name !== currentPlan) {
            card.onclick = () => upgradePlan(name);
        }
        grid.appendChild(card);
    });
}

function showUploadModal() {
    uploadMode = 'file';
    switchUploadMode('file');
    document.getElementById('fileInput').value = '';
    document.getElementById('folderInput').value = '';
    selectedFiles = [];
    showModal('uploadModal');
}

function switchUploadMode(mode) {
    uploadMode = mode;
    
    // Update button states
    document.getElementById('fileModeBtn').classList.toggle('active', mode === 'file');
    document.getElementById('folderModeBtn').classList.toggle('active', mode === 'folder');
    
    // Show/hide input groups
    document.getElementById('fileUploadGroup').style.display = mode === 'file' ? 'block' : 'none';
    document.getElementById('folderUploadGroup').style.display = mode === 'folder' ? 'block' : 'none';
    
    // Clear selections
    document.getElementById('fileInput').value = '';
    document.getElementById('folderInput').value = '';
    selectedFiles = [];
    document.getElementById('uploadInfo').style.display = 'none';
    document.getElementById('uploadStatus').style.display = 'none';
    
    // Update button text
    document.getElementById('uploadBtn').textContent = mode === 'folder' ? 'Upload Folder' : 'Upload';
    
    // Setup folder input listener
    if (mode === 'folder') {
        const folderInput = document.getElementById('folderInput');
        folderInput.onchange = (e) => {
            selectedFiles = Array.from(e.target.files);
            document.getElementById('fileCount').textContent = selectedFiles.length;
            document.getElementById('uploadInfo').style.display = 'block';
        };
    }
}

function showCreateFolderModal() {
    showModal('folderModal');
}

function showUpgradeModal() {
    const grid = document.getElementById('upgradePricingGrid');
    grid.innerHTML = '';

    Object.entries(plans).forEach(([name, plan]) => {
        const card = document.createElement('div');
        card.className = 'pricing-card';
        if (name === currentPlan) {
            card.classList.add('current');
        }
        card.innerHTML = `
            <div class="plan-name">${name}</div>
            <div class="plan-price">${plan.price === 0 ? 'Free' : plan.price.toLocaleString() + ' XAF'}</div>
            <div class="plan-storage">${plan.storage}</div>
        `;
        if (name !== currentPlan) {
            card.onclick = () => upgradePlan(name);
        }
        grid.appendChild(card);
    });

    showModal('upgradeModal');
}

async function upgradePlan(planName) {
    if (!userIsActive) {
        showNotification('Your account has been deactivated. You cannot upgrade your plan.', 'error');
        return;
    }
    
    const plan = plans[planName];
    if (!plan) {
        showNotification('Invalid plan selected', 'error');
        return;
    }
    
    // If free plan, upgrade directly
    if (plan.price === 0) {
        await processUpgrade(planName);
        return;
    }
    
    // For paid plans, show payment selection
    showPaymentSelection(planName, plan);
}

function showPaymentSelection(planName, plan) {
    // Store selected plan for payment processing
    window.selectedPlan = { name: planName, price: plan.price, storage: plan.storage };
    
    // Close upgrade modal and show payment selection
    closeModal('upgradeModal');
    closeModal('settingsModal');
    
    // Show payment selection modal
    const paymentModal = document.getElementById('paymentSelectionModal');
    const planInfo = paymentModal.querySelector('.selected-plan-info');
    planInfo.innerHTML = `
        <div class="plan-summary">
            <div class="plan-summary-name">${planName} Plan</div>
            <div class="plan-summary-storage">${plan.storage}</div>
            <div class="plan-summary-price">${plan.price.toLocaleString()} XAF</div>
        </div>
    `;
    
    showModal('paymentSelectionModal');
}

async function processUpgrade(planName) {
    try {
        const response = await fetch('/api/storage/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_name: planName })
        });

        if (response.ok) {
            showNotification(`Upgraded to ${planName} plan!`, 'success');
            currentPlan = planName;
            closeModal('upgradeModal');
            closeModal('settingsModal');
            closeModal('paymentSelectionModal');
            closeModal('cardPaymentModal');
            closeModal('electronicPaymentModal');
            loadStorageInfo();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to upgrade plan', 'error');
        }
    } catch (error) {
        showNotification('Failed to upgrade plan', 'error');
    }
}

function selectPaymentMethod(method) {
    if (method === 'card') {
        closeModal('paymentSelectionModal');
        // Update payment amount display
        document.getElementById('cardPaymentAmount').textContent = window.selectedPlan.price.toLocaleString();
        // Setup card number formatting
        setupCardInputFormatting();
        showModal('cardPaymentModal');
    } else if (method === 'electronic') {
        closeModal('paymentSelectionModal');
        // Update payment amount display
        document.getElementById('electronicPaymentAmount').textContent = window.selectedPlan.price.toLocaleString();
        showModal('electronicPaymentModal');
    }
}

function setupCardInputFormatting() {
    const cardNumberInput = document.getElementById('cardNumber');
    const cardExpiryInput = document.getElementById('cardExpiry');
    const cardCVCInput = document.getElementById('cardCVC');
    
    // Format card number (add spaces every 4 digits)
    cardNumberInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        if (value.length > 16) value = value.substring(0, 16);
        value = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = value;
    });
    
    // Format expiry date (MM/YY)
    cardExpiryInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.substring(0, 2) + '/' + value.substring(2, 4);
        }
        e.target.value = value;
    });
    
    // Only allow numbers for CVC
    cardCVCInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
}

async function processCardPayment() {
    const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
    const cardName = document.getElementById('cardName').value.trim();
    const cardExpiry = document.getElementById('cardExpiry').value.trim();
    const cardCVC = document.getElementById('cardCVC').value.trim();
    
    // Validation
    if (!cardNumber || cardNumber.length < 13 || cardNumber.length > 19) {
        showNotification('Please enter a valid card number', 'error');
        return;
    }
    if (!cardName) {
        showNotification('Please enter cardholder name', 'error');
        return;
    }
    if (!cardExpiry || !/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        showNotification('Please enter a valid expiry date (MM/YY)', 'error');
        return;
    }
    if (!cardCVC || cardCVC.length < 3 || cardCVC.length > 4) {
        showNotification('Please enter a valid CVC', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('cardPaymentSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    try {
        const response = await fetch('/api/payment/card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan_name: window.selectedPlan.name,
                card_number: cardNumber,
                card_name: cardName,
                card_expiry: cardExpiry,
                card_cvc: cardCVC
            })
        });
        
        if (response.ok) {
            showNotification('Payment processed successfully!', 'success');
            // Clear form
            document.getElementById('cardNumber').value = '';
            document.getElementById('cardName').value = '';
            document.getElementById('cardExpiry').value = '';
            document.getElementById('cardCVC').value = '';
            // Complete upgrade
            await processUpgrade(window.selectedPlan.name);
        } else {
            const data = await response.json();
            showNotification(data.error || 'Payment failed. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Pay Now';
        }
    } catch (error) {
        showNotification('Payment processing error. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pay Now';
    }
}

async function processElectronicPayment() {
    const paymentProvider = document.querySelector('input[name="paymentProvider"]:checked');
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    if (!paymentProvider) {
        showNotification('Please select a payment provider', 'error');
        return;
    }
    if (!phoneNumber || phoneNumber.length < 9) {
        showNotification('Please enter a valid phone number', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('electronicPaymentSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    try {
        const response = await fetch('/api/payment/electronic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan_name: window.selectedPlan.name,
                provider: paymentProvider.value,
                phone_number: phoneNumber
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification(`Payment request sent to ${paymentProvider.value}. Please complete the payment on your phone.`, 'success');
            // Clear form
            document.getElementById('phoneNumber').value = '';
            // Complete upgrade (in real scenario, you'd wait for payment confirmation)
            await processUpgrade(window.selectedPlan.name);
        } else {
            const data = await response.json();
            showNotification(data.error || 'Payment request failed. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Payment Request';
        }
    } catch (error) {
        showNotification('Payment processing error. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Payment Request';
    }
}

async function changePassword() {
    if (!userIsActive) {
        showNotification('Your account has been deactivated. You cannot change your password.', 'error');
        return;
    }
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (!current || !newPass || !confirm) {
        showNotification('Please fill all fields', 'error');
        return;
    }

    if (newPass !== confirm) {
        showNotification('New passwords do not match', 'error');
        return;
    }

    try {
        const response = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: current, new_password: newPass })
        });

        if (response.ok) {
            showNotification('Password changed successfully', 'success');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to change password', 'error');
        }
    } catch (error) {
        showNotification('Failed to change password', 'error');
    }
}

async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;
    
    try {
        const response = await fetch('/api/user/delete-account', {
            method: 'DELETE'
        });

        if (response.ok) {
            const data = await response.json();
            showNotification('Account deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = data.redirect || '/login';
            }, 1000);
        } else {
            showNotification('Failed to delete account', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete account', 'error');
    }
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function closeUserMenu() {
    document.getElementById('userMenu').classList.remove('show');
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} active`;

    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/logout';
    }
}
