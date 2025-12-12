let statsRefreshInterval = null;
let usersRefreshInterval = null;

window.onload = () => {
    loadStats();
    loadUsers();
    loadNodes();
    
    // Start auto-refresh for real-time updates
    startAutoRefresh();
};

// Start auto-refresh every 1 minute for real-time updates
function startAutoRefresh() {
    // Refresh stats every 1 minute
    statsRefreshInterval = setInterval(() => {
        loadStats();
    }, 60000);
    
    // Refresh users table every 5 seconds to show updated storage
    usersRefreshInterval = setInterval(() => {
        if (document.getElementById('users').classList.contains('active')) {
            loadUsers();
        }
    }, 5000);
}

// Stop auto-refresh when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (statsRefreshInterval) clearInterval(statsRefreshInterval);
        if (usersRefreshInterval) clearInterval(usersRefreshInterval);
    } else {
        startAutoRefresh();
    }
});

function showSection(sectionId, skipEvent) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    if (!skipEvent && event && event.target) {
    event.target.closest('.menu-item').classList.add('active');
    } else {
        // Find the corresponding menu item and activate it
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach((item, index) => {
            if ((sectionId === 'dashboard' && index === 0) ||
                (sectionId === 'users' && index === 1) ||
                (sectionId === 'nodes' && index === 2) ||
                (sectionId === 'settings' && index === 3)) {
                item.classList.add('active');
            }
        });
    }
    
    // Refresh data when switching sections
    if (sectionId === 'dashboard') {
        loadStats();
    } else if (sectionId === 'users') {
        loadUsers();
        loadStats(); // Also update stats when viewing users
    } else if (sectionId === 'nodes') {
        loadNodes();
        loadStats(); // Also update stats when viewing nodes
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
}

async function loadStats() {
    try {
        // Add timestamp to prevent caching
        const response = await fetch('/api/admin/stats?t=' + Date.now());
        const data = await response.json();

        // Update stats with smooth transitions
        updateElementWithAnimation('totalUsers', data.users.total);
        updateElementWithAnimation('activeUsers', data.users.active + ' active');
        updateElementWithAnimation('storageUsed', formatBytes(data.storage.total_used));
        updateElementWithAnimation('storagePercent', data.storage.usage_percent.toFixed(1) + '% of total');
        updateElementWithAnimation('totalNodes', data.nodes.total);
        updateElementWithAnimation('activeNodes', data.nodes.active + ' online');
        updateElementWithAnimation('nodeCapacity', formatBytes(data.nodes.capacity));
        updateElementWithAnimation('nodeUsed', formatBytes(data.nodes.used) + ' used');
        
        // Update last refresh time
        const lastRefreshEl = document.getElementById('lastRefreshTime');
        if (lastRefreshEl) {
            lastRefreshEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        }
    } catch (error) {
        console.error('Failed to load statistics:', error);
        // Don't show notification on every failed refresh to avoid spam
    }
}

function updateElementWithAnimation(elementId, newValue) {
    const element = document.getElementById(elementId);
    if (element && element.textContent !== newValue) {
        // Add a subtle flash animation when value changes
        element.style.transition = 'background-color 0.3s';
        element.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        element.textContent = newValue;
        setTimeout(() => {
            element.style.backgroundColor = '';
        }, 300);
    } else if (element) {
        element.textContent = newValue;
    }
}

function refreshPage() {
    // Reload the entire page to get fresh statistics and user count
    window.location.reload();
}

async function loadUsers() {
    try {
        // Add timestamp to prevent caching
        const response = await fetch('/api/admin/users?t=' + Date.now());
        const data = await response.json();
        const tbody = document.getElementById('usersTable');
        
        // Store current scroll position
        const scrollTop = tbody.parentElement.scrollTop;
        
        tbody.innerHTML = '';

        if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No users found</td></tr>';
            return;
        }

        data.users.forEach(user => {
            const tr = document.createElement('tr');
            const storagePercent = user.storage_quota > 0 
                ? ((user.storage_used / user.storage_quota) * 100).toFixed(1) 
                : 0;
            
            tr.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.plan}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span>${formatBytes(user.storage_used)} / ${formatBytes(user.storage_quota)}</span>
                        <div style="width: 100px; height: 4px; background: #e1dfdd; border-radius: 2px; overflow: hidden;">
                            <div style="height: 100%; width: ${Math.min(storagePercent, 100)}%; background: ${storagePercent > 90 ? '#d13438' : storagePercent > 70 ? '#ff8c00' : '#107c10'}; transition: width 0.3s;"></div>
                        </div>
                        <span style="font-size: 11px; color: #605e5c;">${storagePercent}% used</span>
                    </div>
                </td>
                <td>
                    <span class="badge ${user.is_active ? 'badge-success' : 'badge-danger'}">
                        ${user.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm" onclick="toggleUser(${user.id})">
                        ${user.is_active ? '🔒 Deactivate' : '🔓 Activate'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})">🗑️ Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Restore scroll position
        tbody.parentElement.scrollTop = scrollTop;
    } catch (error) {
        console.error('Failed to load users:', error);
        // Don't show notification on every failed refresh to avoid spam
    }
}

async function toggleUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/toggle`, {
            method: 'PUT'
        });

        if (response.ok) {
            showNotification('User status updated', 'success');
            loadUsers();
            loadStats();
        } else {
            showNotification('Failed to update user status', 'error');
        }
    } catch (error) {
        showNotification('Failed to update user status', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('User deleted successfully', 'success');
            loadUsers();
            loadStats();
        } else {
            showNotification('Failed to delete user', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete user', 'error');
    }
}

async function loadNodes() {
    try {
        const response = await fetch('/api/admin/nodes');
        const data = await response.json();
        const tbody = document.getElementById('nodesTable');
        tbody.innerHTML = '';

        if (data.nodes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No nodes configured</td></tr>';
            return;
        }

        data.nodes.forEach(node => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${node.node_id}</td>
                <td>${node.host}:${node.port}</td>
                <td>${formatBytes(node.storage_capacity)}</td>
                <td>${formatBytes(node.used_space || 0)}</td>
                <td>${(node.usage_percent || 0).toFixed(1)}%</td>
                <td>
                    <span class="badge ${node.is_active ? 'badge-success' : 'badge-danger'}">
                        ${node.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm" onclick="toggleNode('${node.node_id}')">
                        ${node.is_active ? '⏸️ Offline' : '▶️ Online'}
                    </button>
                    <button class="btn btn-sm" onclick="duplicateNode('${node.node_id}')">📋 Duplicate</button>
                    <button class="btn btn-sm" onclick="showNodeSettings('${node.node_id}')">⚙️ Settings</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteNode('${node.node_id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        showNotification('Failed to load nodes', 'error');
    }
}

function showAddNodeModal() {
    showModal('addNodeModal');
}

async function addNode() {
    const nodeId = document.getElementById('nodeId').value;
    const host = document.getElementById('nodeHost').value;
    const port = parseInt(document.getElementById('nodePort').value);
    const capacity = parseInt(document.getElementById('nodeCapacityInput').value);

    if (!nodeId || !host || !port || !capacity) {
        showNotification('Please fill all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/admin/nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: nodeId, host, port, capacity })
        });

        if (response.ok) {
            showNotification('Node added successfully', 'success');
            closeModal('addNodeModal');
            loadNodes();
            loadStats();
            document.getElementById('nodeId').value = '';
            document.getElementById('nodePort').value = '';
            document.getElementById('nodeCapacityInput').value = '';
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to add node', 'error');
        }
    } catch (error) {
        showNotification('Failed to add node', 'error');
    }
}

async function toggleNode(nodeId) {
    try {
        const response = await fetch(`/api/admin/nodes/${nodeId}/toggle`, {
            method: 'PUT'
        });

        if (response.ok) {
            showNotification('Node status updated', 'success');
            loadNodes();
            loadStats();
        } else {
            showNotification('Failed to update node status', 'error');
        }
    } catch (error) {
        showNotification('Failed to update node status', 'error');
    }
}

async function duplicateNode(nodeId) {
    const newNodeId = prompt('Enter new node ID:');
    if (!newNodeId) return;

    try {
        const response = await fetch(`/api/admin/nodes/${nodeId}/duplicate?new_node_id=${newNodeId}`, {
            method: 'POST'
        });

        if (response.ok) {
            showNotification('Node duplicated successfully', 'success');
            loadNodes();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to duplicate node', 'error');
        }
    } catch (error) {
        showNotification('Failed to duplicate node', 'error');
    }
}

async function deleteNode(nodeId) {
    if (!confirm('Are you sure you want to delete this node?')) return;

    try {
        const response = await fetch(`/api/admin/nodes/${nodeId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('Node deleted successfully', 'success');
            loadNodes();
            loadStats();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to delete node', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete node', 'error');
    }
}

async function showNodeSettings(nodeId) {
    try {
        const response = await fetch('/api/admin/nodes');
        const data = await response.json();
        const node = data.nodes.find(n => n.node_id === nodeId);
        
        if (!node) {
            showNotification('Node not found', 'error');
            return;
        }
        
        // Format the data for display
        const storageGB = (node.storage_capacity / (1024 * 1024 * 1024)).toFixed(2);
        const bandwidthGbps = node.bandwidth >= 1000 ? (node.bandwidth / 1000).toFixed(1) + ' Gbps' : node.bandwidth + ' Mbps';
        
        // Populate the modal
        document.getElementById('settingsNodeIdHeader').textContent = node.node_id;
        document.getElementById('settingsNodeId').textContent = node.node_id;
        document.getElementById('settingsCpu').textContent = node.cpu_capacity + ' vCPUs';
        document.getElementById('settingsMemory').textContent = node.memory_capacity + ' GB';
        document.getElementById('settingsStorage').textContent = storageGB + ' GB';
        document.getElementById('settingsBandwidth').textContent = bandwidthGbps + ` (${node.bandwidth} Mbps)`;
        document.getElementById('settingsHostPort').textContent = node.host + ':' + node.port;
        document.getElementById('settingsStatus').textContent = node.status;
        document.getElementById('settingsStatus').className = `badge ${node.is_active ? 'badge-success' : 'badge-danger'}`;
        
        // Show the modal
        showModal('nodeSettingsModal');
    } catch (error) {
        showNotification('Failed to load node settings', 'error');
    }
}

async function changeUsername() {
    const newUsername = document.getElementById('newUsername').value.trim();

    if (!newUsername) {
        showNotification('Please enter a new username', 'error');
        return;
    }

    if (newUsername.length < 3) {
        showNotification('Username must be at least 3 characters', 'error');
        return;
    }

    if (!confirm('Are you sure you want to change your username to "' + newUsername + '"? You will need to use the new username for future logins.')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/change-username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_username: newUsername })
        });

        if (response.ok) {
            showNotification('Username changed successfully! Please login again with your new username.', 'success');
            document.getElementById('newUsername').value = '';
            setTimeout(() => {
                window.location.href = '/admin/login';
            }, 2000);
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to change username', 'error');
        }
    } catch (error) {
        showNotification('Failed to change username', 'error');
    }
}

async function deleteAdminAccount() {
    const password = document.getElementById('deletePassword').value;

    if (!password) {
        showNotification('Please enter your password to confirm deletion', 'error');
        return;
    }

    if (!confirm('⚠️ WARNING: This action is permanent and cannot be undone!\n\nAre you absolutely sure you want to delete your admin account? You will be logged out immediately.')) {
        return;
    }

    if (!confirm('This is your last chance. Click OK to permanently delete your admin account.')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/delete-account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });

        if (response.ok) {
            showNotification('Admin account deleted successfully. Redirecting to login...', 'success');
            setTimeout(() => {
                window.location.href = '/admin/login';
            }, 2000);
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to delete account', 'error');
            document.getElementById('deletePassword').value = '';
        }
    } catch (error) {
        showNotification('Failed to delete account', 'error');
    }
}

async function changePassword() {
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
        const response = await fetch('/api/admin/change-password', {
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

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} active`;

    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
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

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/logout';
    }
}

