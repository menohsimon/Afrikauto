from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
import os
import base64
import time
import random
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from models import db, User, Admin, File, Folder, StorageNode
from storage_service import StorageService

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///boxcloud.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 * 1024  # 10GB max file size

# Email configuration for OTP
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', 'simon.menoh20@gmail.com')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', 'jpkhodpbkjmimpfe').replace(' ', '')  # Remove spaces from app password
db.init_app(app)

# Storage service will be initialized lazily when needed
_storage_service = None

def get_storage_service():
    """Get or create storage service instance within app context"""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service

# OTP storage (in production, use Redis or database)
otp_storage = {}  # {email: {'otp': code, 'expires': timestamp, 'user_id': id}}
reset_otp_storage = {}  # {email: {'otp': code, 'expires': timestamp, 'user_id': id}} for password reset

def generate_otp():
    """Generate a 6-digit OTP"""
    return str(random.randint(100000, 999999))

def send_otp_email(email, otp, user_name):
    """Send OTP via email"""
    try:
        mail_server = app.config['MAIL_SERVER']
        mail_port = app.config['MAIL_PORT']
        mail_username = app.config['MAIL_USERNAME']
        mail_password = app.config['MAIL_PASSWORD'].replace(' ', '')  # Remove spaces from app password
        
        # Skip email sending if using default placeholder credentials
        if mail_username == 'your-email@gmail.com' or mail_password == 'your-app-password' or not mail_password:
            print(f"[OTP for {email}]: {otp}")  # Print to console for development
            return True
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = mail_username
        msg['To'] = email
        msg['Subject'] = 'BOXCLOUD - Login OTP Verification'
        
        body = f"""
        <html>
        <body>
            <h2>BOXCLOUD Login Verification</h2>
            <p>Hello {user_name},</p>
            <p>Your One-Time Password (OTP) for login is:</p>
            <h1 style="color: #667eea; font-size: 32px; letter-spacing: 5px;">{otp}</h1>
            <p>This OTP is valid for 10 minutes.</p>
            <p>If you did not request this OTP, please ignore this email.</p>
            <hr>
            <p style="color: #605e5c; font-size: 12px;">This is an automated message from BOXCLOUD.</p>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        # Send email
        server = smtplib.SMTP(mail_server, mail_port)
        server.starttls()
        server.login(mail_username, mail_password)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        # For development, print OTP to console
        print(f"[OTP for {email}]: {otp}")
        return True  # Return True even if email fails (for development)

# Create uploads directory
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ========== HELPER FUNCTIONS ==========

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def check_user_active():
    """Check if the logged-in user is active. Returns (is_active, user) tuple."""
    if 'user_id' not in session:
        return False, None
    user = User.query.get(session['user_id'])
    if not user:
        return False, None
    return user.is_active, user

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def format_bytes(bytes):
    """Format bytes to human readable format"""
    if bytes == 0:
        return '0 Bytes'
    k = 1024
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    i = int(bytes.bit_length() / 10)
    return f"{bytes / (k ** i):.2f} {sizes[i]}"

# ========== ROUTES ==========

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password) and user.is_active:
            # Generate and send OTP
            otp = generate_otp()
            expires_at = time.time() + 600  # 10 minutes
            
            # Store OTP with user info
            otp_storage[email] = {
                'otp': otp,
                'expires': expires_at,
                'user_id': user.id
            }
            
            # Send OTP via email
            send_otp_email(email, otp, user.name)
            
            # Store email in session for OTP verification
            session['otp_email'] = email
            session['login_attempt'] = True
            
            return jsonify({
                'success': True, 
                'requires_otp': True,
                'redirect': url_for('verify_otp'),
                'message': 'OTP has been sent to your email. Please check your inbox.'
            })
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    return render_template('login.html')

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        user = User.query.filter_by(email=email).first()
        if not user:
            # Don't reveal if email exists for security
            return jsonify({
                'success': True,
                'redirect': url_for('verify_reset_otp'),
                'message': 'If the email exists, a verification code has been sent.'
            })
        
        # Generate and send OTP
        otp = generate_otp()
        expires_at = time.time() + 600  # 10 minutes
        
        # Store OTP for password reset
        reset_otp_storage[email] = {
            'otp': otp,
            'expires': expires_at,
            'user_id': user.id
        }
        
        # Send OTP via email
        send_otp_email(email, otp, user.name)
        
        # Store email in session for OTP verification
        session['reset_email'] = email
        session['reset_attempt'] = True
        
        return jsonify({
            'success': True,
            'redirect': url_for('verify_reset_otp'),
            'message': 'Verification code has been sent to your email.'
        })
    
    return render_template('forgot_password.html')

@app.route('/verify-reset-otp', methods=['GET', 'POST'])
def verify_reset_otp():
    if request.method == 'POST':
        data = request.get_json()
        otp = data.get('otp', '').strip()
        email = session.get('reset_email')
        
        if not email:
            return jsonify({'success': False, 'message': 'Session expired. Please start again.'}), 401
        
        # Check if OTP exists and is valid
        if email not in reset_otp_storage:
            return jsonify({'success': False, 'message': 'OTP expired. Please request a new one.'}), 400
        
        otp_data = reset_otp_storage[email]
        
        # Check if OTP is expired
        if time.time() > otp_data['expires']:
            del reset_otp_storage[email]
            session.pop('reset_email', None)
            return jsonify({'success': False, 'message': 'OTP expired. Please request a new one.'}), 400
        
        # Verify OTP
        if otp_data['otp'] != otp:
            return jsonify({'success': False, 'message': 'Invalid OTP. Please try again.'}), 400
        
        # OTP is valid, allow password reset
        session['reset_verified'] = True
        session['reset_user_id'] = otp_data['user_id']
        # Don't delete OTP yet, keep it until password is reset
        
        return jsonify({'success': True, 'redirect': url_for('reset_password')})
    
    # GET request - show OTP verification page
    if not session.get('reset_attempt'):
        return redirect(url_for('forgot_password'))
    
    email = session.get('reset_email', '')
    # Mask email for display
    if email:
        parts = email.split('@')
        if len(parts) == 2:
            masked_email = parts[0][0] + '*' * (len(parts[0]) - 1) + '@' + parts[1]
        else:
            masked_email = email
    else:
        masked_email = ''
    
    return render_template('verify_reset_otp.html', email=masked_email)

@app.route('/resend-reset-otp', methods=['POST'])
def resend_reset_otp():
    email = session.get('reset_email')
    
    if not email:
        return jsonify({'success': False, 'message': 'Session expired. Please start again.'}), 401
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'success': False, 'message': 'User not found'}), 404
    
    # Generate new OTP
    otp = generate_otp()
    expires_at = time.time() + 600  # 10 minutes
    
    # Update OTP storage
    reset_otp_storage[email] = {
        'otp': otp,
        'expires': expires_at,
        'user_id': user.id
    }
    
    # Send new OTP
    send_otp_email(email, otp, user.name)
    
    return jsonify({'success': True, 'message': 'New OTP has been sent to your email.'})

@app.route('/reset-password', methods=['GET', 'POST'])
def reset_password():
    if request.method == 'POST':
        # Check if OTP was verified
        if not session.get('reset_verified'):
            return jsonify({'success': False, 'message': 'Please verify your OTP first.'}), 401
        
        user_id = session.get('reset_user_id')
        if not user_id:
            return jsonify({'success': False, 'message': 'Session expired. Please start again.'}), 401
        
        data = request.get_json()
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')
        
        if not new_password or len(new_password) < 6:
            return jsonify({'success': False, 'message': 'Password must be at least 6 characters long.'}), 400
        
        if new_password != confirm_password:
            return jsonify({'success': False, 'message': 'Passwords do not match.'}), 400
        
        # Get user and reset password
        user = User.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found.'}), 404
        
        user.set_password(new_password)
        db.session.commit()
        
        # Clear reset session and OTP
        email = session.get('reset_email')
        if email and email in reset_otp_storage:
            del reset_otp_storage[email]
        session.pop('reset_email', None)
        session.pop('reset_attempt', None)
        session.pop('reset_verified', None)
        session.pop('reset_user_id', None)
        
        return jsonify({
            'success': True,
            'redirect': url_for('login'),
            'message': 'Password reset successfully!'
        })
    
    # GET request - show password reset page
    if not session.get('reset_verified'):
        return redirect(url_for('forgot_password'))
    
    return render_template('reset_password.html')

@app.route('/verify-otp', methods=['GET', 'POST'])
def verify_otp():
    if request.method == 'POST':
        data = request.get_json()
        otp = data.get('otp', '').strip()
        email = session.get('otp_email')
        
        if not email:
            return jsonify({'success': False, 'message': 'Session expired. Please login again.'}), 401
        
        # Check if OTP exists and is valid
        if email not in otp_storage:
            return jsonify({'success': False, 'message': 'OTP expired. Please login again.'}), 400
        
        otp_data = otp_storage[email]
        
        # Check if OTP is expired
        if time.time() > otp_data['expires']:
            del otp_storage[email]
            session.pop('otp_email', None)
            return jsonify({'success': False, 'message': 'OTP expired. Please login again.'}), 400
        
        # Verify OTP
        if otp_data['otp'] != otp:
            return jsonify({'success': False, 'message': 'Invalid OTP. Please try again.'}), 400
        
        # OTP is valid, complete login
        user_id = otp_data['user_id']
        session['user_id'] = user_id
        session.pop('otp_email', None)
        session.pop('login_attempt', None)
        del otp_storage[email]
        
        return jsonify({'success': True, 'redirect': url_for('dashboard')})
    
    # GET request - show OTP verification page
    if not session.get('login_attempt'):
        return redirect(url_for('login'))
    
    email = session.get('otp_email', '')
    # Mask email for display
    if email:
        parts = email.split('@')
        if len(parts) == 2:
            masked_email = parts[0][0] + '*' * (len(parts[0]) - 1) + '@' + parts[1]
        else:
            masked_email = email
    else:
        masked_email = ''
    
    return render_template('verify_otp.html', email=masked_email)

@app.route('/resend-otp', methods=['POST'])
def resend_otp():
    email = session.get('otp_email')
    
    if not email:
        return jsonify({'success': False, 'message': 'Session expired. Please login again.'}), 401
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'success': False, 'message': 'User not found'}), 404
    
    # Generate new OTP
    otp = generate_otp()
    expires_at = time.time() + 600  # 10 minutes
    
    # Update OTP storage
    otp_storage[email] = {
        'otp': otp,
        'expires': expires_at,
        'user_id': user.id
    }
    
    # Send new OTP
    send_otp_email(email, otp, user.name)
    
    return jsonify({'success': True, 'message': 'New OTP has been sent to your email.'})

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        
        if User.query.filter_by(email=email).first():
            return jsonify({'success': False, 'message': 'Email already registered'}), 400
        
        user = User(
            name=name,
            email=email,
            plan='Free',
            storage_quota=5368709120  # 5GB
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        # Redirect to login page instead of auto-logging in
        return jsonify({'success': True, 'redirect': url_for('login'), 'message': 'Account created successfully! Please login to continue.'})
    
    return render_template('register.html')

@app.route('/dashboard')
@login_required
def dashboard():
    user = User.query.get(session['user_id'])
    return render_template('dashboard.html', user=user)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ========== API ROUTES ==========

@app.route('/api/storage/info')
@login_required
def storage_info():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Not authenticated'}), 401
        
        # Re-query user to get fresh data from database
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Calculate storage percentage
        storage_percent = (user.storage_used / user.storage_quota * 100) if user.storage_quota > 0 else 0
        
        return jsonify({
            'storage_used': user.storage_used,
            'storage_quota': user.storage_quota,
            'plan': user.plan,
            'is_active': user.is_active,
            'storage_percent': storage_percent
        })
    except Exception as e:
        import traceback
        print(f"Error in storage_info: {e}")
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to load storage info', 'details': str(e)}), 500

@app.route('/api/storage/files')
@login_required
def get_files():
    user = User.query.get(session['user_id'])
    folder_id = request.args.get('folder_id')
    
    if folder_id:
        folder = Folder.query.filter_by(id=folder_id, user_id=user.id).first()
        if not folder:
            return jsonify({'error': 'Folder not found'}), 404
        
        files = File.query.filter_by(user_id=user.id, folder_id=folder_id).all()
        folders = Folder.query.filter_by(user_id=user.id, parent_id=folder_id).all()
    else:
        files = File.query.filter_by(user_id=user.id, folder_id=None).all()
        folders = Folder.query.filter_by(user_id=user.id, parent_id=None).all()
    
    return jsonify({
        'files': [f.to_dict() for f in files],
        'folders': [f.to_dict() for f in folders]
    })

@app.route('/api/storage/upload', methods=['POST'])
@login_required
def upload_file():
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    file_size = len(file.read())
    file.seek(0)
    
    # Check storage quota
    if user.storage_used + file_size > user.storage_quota:
        return jsonify({'error': 'Storage quota exceeded'}), 400
    
    # Read file data
    file_data = file.read()
    folder_id = request.form.get('folder_id')
    
    # Store file using storage service
    file_id, chunks_info = get_storage_service().store_file(
        file_data, 
        secure_filename(file.filename), 
        file_size
    )
    
    if not file_id:
        return jsonify({'error': 'Failed to store file'}), 500
    
    # Save file record to database
    db_file = File(
        user_id=user.id,
        folder_id=int(folder_id) if folder_id else None,
        name=secure_filename(file.filename),
        original_name=file.filename,
        mime_type=file.content_type,
        size=file_size,
        file_id=file_id
    )
    db_file.set_chunks_info(chunks_info)
    
    db.session.add(db_file)
    user.storage_used += file_size
    db.session.commit()
    
    # Ensure user is attached to session and get fresh value
    db.session.merge(user)
    db.session.refresh(user)
    
    return jsonify({
        'success': True, 
        'file_id': file_id, 
        'storage_used': user.storage_used, 
        'storage_quota': user.storage_quota
    })

@app.route('/api/storage/upload-folder', methods=['POST'])
@login_required
def upload_folder():
    """Upload a file from a folder structure, creating folders as needed"""
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    relative_path = request.form.get('relative_path', file.filename)
    parent_folder_id = request.form.get('parent_folder_id')
    
    # Parse the relative path to get folder structure
    path_parts = relative_path.replace('\\', '/').split('/')
    filename = path_parts[-1]
    folder_paths = path_parts[:-1] if len(path_parts) > 1 else []
    
    file_size = len(file.read())
    file.seek(0)
    
    # Check storage quota
    if user.storage_used + file_size > user.storage_quota:
        return jsonify({'error': 'Storage quota exceeded'}), 400
    
    # Create folder structure
    current_parent_id = int(parent_folder_id) if parent_folder_id else None
    
    for folder_name in folder_paths:
        if not folder_name:
            continue
            
        # Check if folder already exists
        existing_folder = Folder.query.filter_by(
            user_id=user.id,
            parent_id=current_parent_id,
            name=folder_name
        ).first()
        
        if existing_folder:
            current_parent_id = existing_folder.id
        else:
            # Create new folder
            new_folder = Folder(
                user_id=user.id,
                parent_id=current_parent_id,
                name=folder_name
            )
            db.session.add(new_folder)
            db.session.commit()
            current_parent_id = new_folder.id
    
    # Read file data
    file_data = file.read()
    
    # Store file using storage service
    file_id, chunks_info = get_storage_service().store_file(
        file_data, 
        secure_filename(filename), 
        file_size
    )
    
    if not file_id:
        return jsonify({'error': 'Failed to store file'}), 500
    
    # Save file record to database
    db_file = File(
        user_id=user.id,
        folder_id=current_parent_id,
        name=secure_filename(filename),
        original_name=filename,
        mime_type=file.content_type,
        size=file_size,
        file_id=file_id
    )
    db_file.set_chunks_info(chunks_info)
    
    db.session.add(db_file)
    user.storage_used += file_size
    db.session.commit()
    
    # Ensure user is attached to session and get fresh value
    db.session.merge(user)
    db.session.refresh(user)
    
    return jsonify({
        'success': True, 
        'file_id': file_id, 
        'storage_used': user.storage_used, 
        'storage_quota': user.storage_quota
    })

@app.route('/api/storage/download/<int:file_id>')
@login_required
def download_file(file_id):
    user = User.query.get(session['user_id'])
    file = File.query.filter_by(id=file_id, user_id=user.id).first()
    
    if not file:
        return jsonify({'error': 'File not found'}), 404
    
    # Retrieve file from storage service
    chunks_info = file.get_chunks_info()
    file_data = get_storage_service().retrieve_file(file.file_id, chunks_info)
    
    if not file_data:
        return jsonify({'error': 'Failed to retrieve file'}), 500
    
    # For now, return as base64 (in production, use proper file streaming)
    return jsonify({
        'data': base64.b64encode(file_data).decode('utf-8'),
        'mime_type': file.mime_type or 'application/octet-stream'
    })

@app.route('/api/storage/file/<int:file_id>', methods=['DELETE'])
@login_required
def delete_file(file_id):
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    file = File.query.filter_by(id=file_id, user_id=user.id).first()
    
    if not file:
        return jsonify({'error': 'File not found'}), 404
    
    # Mark file as deleted instead of actually deleting (for restore functionality)
    # Store file info before deletion for restore
    file_data = {
        'id': file.id,
        'name': file.name,
        'original_name': file.original_name,
        'mime_type': file.mime_type,
        'size': file.size,
        'file_id': file.file_id,
        'chunks_info': file.chunks_info,
        'folder_id': file.folder_id,
        'user_id': file.user_id
    }
    
    # Delete from storage service
    chunks_info = file.get_chunks_info()
    get_storage_service().delete_file(file.file_id, chunks_info)
    
    # Update user storage
    file_size = file.size
    user.storage_used -= file_size
    if user.storage_used < 0:
        user.storage_used = 0
    db.session.delete(file)
    db.session.commit()
    
    # Ensure user is attached to session and get fresh value
    db.session.merge(user)
    db.session.refresh(user)
    
    return jsonify({
        'success': True, 
        'storage_used': user.storage_used, 
        'storage_quota': user.storage_quota,
        'deleted_file': file_data  # Return file data for frontend to store
    })

@app.route('/api/storage/file/restore', methods=['POST'])
@login_required
def restore_file():
    """Restore a deleted file"""
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    
    # Get file data from request (stored in frontend)
    file_data = data.get('file_data')
    if not file_data:
        return jsonify({'error': 'File data not provided'}), 400
    
    # Check storage quota
    file_size = int(file_data.get('size', 0))
    if user.storage_used + file_size > user.storage_quota:
        return jsonify({'error': 'Storage quota exceeded'}), 400
    
    # Generate new file_id since old one is deleted
    import hashlib
    import time
    new_file_id = hashlib.md5(f"{file_data.get('original_name', 'restored')}-{time.time()}".encode()).hexdigest()
    
    # Recreate file record with new file_id
    restored_file = File(
        user_id=user.id,
        folder_id=int(file_data.get('folder_id')) if file_data.get('folder_id') else None,
        name=file_data.get('name', file_data.get('original_name')),
        original_name=file_data.get('original_name', file_data.get('name')),
        mime_type=file_data.get('mime_type'),
        size=file_size,
        file_id=new_file_id
    )
    
    # Note: In a real system, you'd restore the actual file chunks from backup
    # For now, we create a placeholder (file won't be downloadable but record exists)
    restored_file.set_chunks_info({})
    
    db.session.add(restored_file)
    user.storage_used += file_size
    db.session.commit()
    
    db.session.merge(user)
    db.session.refresh(user)
    
    return jsonify({
        'success': True,
        'storage_used': user.storage_used,
        'storage_quota': user.storage_quota,
        'message': 'File record restored. Note: File content may need to be re-uploaded in production system.'
    })

@app.route('/api/storage/folder', methods=['POST'])
@login_required
def create_folder():
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    folder_name = data.get('folder_name')
    parent_id = data.get('parent_id')
    
    folder = Folder(
        user_id=user.id,
        parent_id=int(parent_id) if parent_id else None,
        name=folder_name
    )
    
    db.session.add(folder)
    db.session.commit()
    
    return jsonify({'success': True, 'folder': folder.to_dict()})

@app.route('/api/storage/folder/<int:folder_id>', methods=['DELETE'])
@login_required
def delete_folder(folder_id):
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    folder = Folder.query.filter_by(id=folder_id, user_id=user.id).first()
    
    if not folder:
        return jsonify({'error': 'Folder not found'}), 404
    
    # Store folder data before deletion for restore
    folder_data = {
        'id': folder.id,
        'name': folder.name,
        'parent_id': folder.parent_id,
        'user_id': folder.user_id
    }
    
    # Delete all files in folder (cascade will handle this)
    files = File.query.filter_by(folder_id=folder_id).all()
    total_size = 0
    for file in files:
        chunks_info = file.get_chunks_info()
        get_storage_service().delete_file(file.file_id, chunks_info)
        total_size += file.size
    
    user.storage_used -= total_size
    if user.storage_used < 0:
        user.storage_used = 0
    
    db.session.delete(folder)
    db.session.commit()
    
    # Ensure user is attached to session and get fresh value
    db.session.merge(user)
    db.session.refresh(user)
    
    return jsonify({
        'success': True, 
        'storage_used': user.storage_used, 
        'storage_quota': user.storage_quota,
        'deleted_folder': folder_data  # Return folder data for frontend to store
    })

@app.route('/api/storage/folder/restore', methods=['POST'])
@login_required
def restore_folder():
    """Restore a deleted folder"""
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    
    # Get folder data from request (stored in frontend)
    folder_data = data.get('folder_data')
    if not folder_data:
        return jsonify({'error': 'Folder data not provided'}), 400
    
    folder_id = folder_data.get('id') or folder_data.get('_id')
    if folder_id:
        # Check if folder already exists with this ID
        existing = Folder.query.filter_by(
            id=int(folder_id) if isinstance(folder_id, str) else folder_id,
            user_id=user.id
        ).first()
        if existing:
            return jsonify({'error': 'Folder already exists'}), 400
    
    # Recreate folder record (let database assign new ID if old one conflicts)
    restored_folder = Folder(
        user_id=user.id,
        parent_id=int(folder_data.get('parent_id')) if folder_data.get('parent_id') else None,
        name=folder_data.get('name', 'Restored Folder')
    )
    
    db.session.add(restored_folder)
    db.session.commit()
    
    db.session.merge(user)
    db.session.refresh(user)
    
    return jsonify({
        'success': True,
        'storage_used': user.storage_used,
        'storage_quota': user.storage_quota,
        'message': 'Folder restored successfully',
        'folder_id': restored_folder.id
    })

@app.route('/api/storage/upgrade', methods=['POST'])
@login_required
def upgrade_plan():
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    plan_name = data.get('plan_name')
    
    plans = {
        'Free': 5368709120,      # 5GB
        'Basic': 53687091200,     # 50GB
        'Pro': 214748364800,       # 200GB
        'Business': 1099511627776  # 1TB
    }
    
    if plan_name in plans:
        user.plan = plan_name
        user.storage_quota = plans[plan_name]
        db.session.commit()
        return jsonify({'success': True})
    
    return jsonify({'error': 'Invalid plan'}), 400

@app.route('/api/payment/card', methods=['POST'])
@login_required
def process_card_payment():
    """Process card payment and upgrade plan"""
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    plan_name = data.get('plan_name')
    card_number = data.get('card_number', '').replace(' ', '')
    card_name = data.get('card_name')
    card_expiry = data.get('card_expiry')
    card_cvc = data.get('card_cvc')
    
    # Validate card details
    if not card_number or len(card_number) < 13 or len(card_number) > 19:
        return jsonify({'error': 'Invalid card number'}), 400
    if not card_name:
        return jsonify({'error': 'Cardholder name is required'}), 400
    if not card_expiry or not re.match(r'^\d{2}/\d{2}$', card_expiry):
        return jsonify({'error': 'Invalid expiry date format'}), 400
    if not card_cvc or len(card_cvc) < 3 or len(card_cvc) > 4:
        return jsonify({'error': 'Invalid CVC'}), 400
    
    # In a real application, you would integrate with a payment gateway here
    # For now, we'll simulate a successful payment
    
    plans = {
        'Free': 5368709120,      # 5GB
        'Basic': 53687091200,     # 50GB
        'Pro': 214748364800,       # 200GB
        'Business': 1099511627776  # 1TB
    }
    
    if plan_name in plans:
        user.plan = plan_name
        user.storage_quota = plans[plan_name]
        db.session.commit()
        return jsonify({'success': True, 'message': 'Payment processed successfully'})
    
    return jsonify({'error': 'Invalid plan'}), 400

@app.route('/api/payment/electronic', methods=['POST'])
@login_required
def process_electronic_payment():
    """Process electronic payment (Orange Money/MTN Money) and upgrade plan"""
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    plan_name = data.get('plan_name')
    provider = data.get('provider')  # 'orange_money' or 'mtn_money'
    phone_number = data.get('phone_number', '').replace(' ', '').replace('-', '')
    
    # Validate inputs
    if not provider or provider not in ['orange_money', 'mtn_money']:
        return jsonify({'error': 'Invalid payment provider'}), 400
    if not phone_number or len(phone_number) < 9:
        return jsonify({'error': 'Invalid phone number'}), 400
    
    # In a real application, you would integrate with Orange Money/MTN Money API here
    # For now, we'll simulate a successful payment request
    
    plans = {
        'Free': 5368709120,      # 5GB
        'Basic': 53687091200,     # 50GB
        'Pro': 214748364800,       # 200GB
        'Business': 1099511627776  # 1TB
    }
    
    if plan_name in plans:
        user.plan = plan_name
        user.storage_quota = plans[plan_name]
        db.session.commit()
        return jsonify({
            'success': True, 
            'message': f'Payment request sent to {provider.replace("_", " ").title()}. Please complete the payment on your phone.'
        })
    
    return jsonify({'error': 'Invalid plan'}), 400

@app.route('/api/user/change-password', methods=['POST'])
@login_required
def change_user_password():
    is_active, user = check_user_active()
    if not is_active:
        return jsonify({'error': 'Your account has been deactivated. Please contact the administrator.'}), 403
    
    data = request.get_json()
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    
    if not user.check_password(old_password):
        return jsonify({'error': 'Current password is incorrect'}), 400
    
    user.set_password(new_password)
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/user/delete-account', methods=['DELETE'])
@login_required
def delete_user_account():
    user = User.query.get(session['user_id'])
    
    # Delete all user files from storage
    for file in user.files:
        chunks_info = file.get_chunks_info()
        get_storage_service().delete_file(file.file_id, chunks_info)
    
    db.session.delete(user)
    db.session.commit()
    session.clear()
    
    return jsonify({'success': True, 'redirect': url_for('login')})

# ========== ADMIN ROUTES ==========

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        admin = Admin.query.filter_by(username=username).first()
        if admin and admin.check_password(password):
            # Check if default password is being used
            default_password = 'Admin@123'
            if admin.check_password(default_password) and not admin.password_changed:
                session['admin_id'] = admin.id
                session['default_password_used'] = True
                return jsonify({
                    'success': True, 
                    'requires_password_change': True,
                    'redirect': url_for('admin_password_choice')
                })
            else:
                session['admin_id'] = admin.id
                session['default_password_used'] = False
                return jsonify({'success': True, 'redirect': url_for('admin_panel')})
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    return render_template('admin_login.html')

@app.route('/admin/create-admin', methods=['POST'])
def create_admin():
    """Create a new admin account (accessible from login page)"""
    data = request.get_json()
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({'error': 'Username is required'}), 400
    
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    
    # Check if username already exists
    if Admin.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    # Create new admin with default password
    new_admin = Admin(username=username)
    new_admin.set_password('Admin@123')
    new_admin.password_changed = False  # Will trigger password change on first login
    
    db.session.add(new_admin)
    db.session.commit()
    
    return jsonify({'success': True, 'username': username})

@app.route('/admin/password-choice')
@admin_required
def admin_password_choice():
    # Only show this page if default password was used
    if not session.get('default_password_used', False):
        return redirect(url_for('admin_panel'))
    admin = Admin.query.get(session['admin_id'])
    return render_template('admin_password_choice.html', admin=admin)

@app.route('/admin/continue-login', methods=['POST'])
@admin_required
def admin_continue_login():
    # Clear the flag and redirect to dashboard
    session.pop('default_password_used', None)
    return jsonify({'success': True, 'redirect': url_for('admin_panel')})

@app.route('/admin/go-to-settings', methods=['POST'])
@admin_required
def admin_go_to_settings():
    # Clear the flag and redirect to settings
    session.pop('default_password_used', None)
    # Store flag to auto-open settings section
    session['open_settings'] = True
    return jsonify({'success': True, 'redirect': url_for('admin_panel')})

@app.route('/admin')
@admin_required
def admin_panel():
    admin = Admin.query.get(session['admin_id'])
    open_settings = session.pop('open_settings', False)
    return render_template('admin.html', admin=admin, open_settings=open_settings)

@app.route('/api/admin/stats')
@admin_required
def admin_stats():
    # Force fresh query from database (no caching)
    db.session.expire_all()
    
    users = User.query.all()
    nodes = StorageNode.query.all()
    network_stats = get_storage_service().get_network_stats()
    
    # Calculate real-time storage usage from actual user data
    total_storage_used = sum(u.storage_used for u in users)
    total_storage_quota = sum(u.storage_quota for u in users)
    
    # Calculate per-user storage for detailed analysis
    user_storage_details = []
    for user in users:
        user_storage_details.append({
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'storage_used': user.storage_used,
            'storage_quota': user.storage_quota,
            'usage_percent': (user.storage_used / user.storage_quota * 100) if user.storage_quota > 0 else 0
        })
    
    return jsonify({
        'users': {
            'total': len(users),
            'active': len([u for u in users if u.is_active])
        },
        'storage': {
            'total_used': total_storage_used,
            'total_quota': total_storage_quota,
            'usage_percent': (total_storage_used / total_storage_quota * 100) if total_storage_quota > 0 else 0,
            'user_details': user_storage_details
        },
        'nodes': {
            'total': len(nodes),
            'active': len([n for n in nodes if n.is_active]),
            'capacity': network_stats.get('total_storage_bytes', 0),
            'used': network_stats.get('used_storage_bytes', 0)
        },
        'timestamp': time.time()  # Add timestamp for cache busting
    })

@app.route('/api/admin/users')
@admin_required
def admin_users():
    # Force fresh query from database (no caching)
    db.session.expire_all()
    
    users = User.query.all()
    
    # Ensure storage_used is up-to-date by refreshing from database
    user_list = []
    for user in users:
        user_dict = user.to_dict()
        # Refresh user object to get latest storage_used
        db.session.refresh(user)
        user_dict['storage_used'] = user.storage_used
        user_dict['storage_quota'] = user.storage_quota
        user_list.append(user_dict)
    
    return jsonify({
        'users': user_list,
        'timestamp': time.time()  # Add timestamp for cache busting
    })

@app.route('/api/admin/users/<int:user_id>/toggle', methods=['PUT'])
@admin_required
def toggle_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    user.is_active = not user.is_active
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
        # Delete all user files from storage
    for file in user.files:
        chunks_info = file.get_chunks_info()
        get_storage_service().delete_file(file.file_id, chunks_info)
    
    db.session.delete(user)
    db.session.commit()
    return jsonify({'success': True})

def calculate_node_storage_usage():
    """Calculate actual storage usage per node from active users' files"""
    # Get all files from active users
    active_users = User.query.filter_by(is_active=True).all()
    active_user_ids = [u.id for u in active_users]
    
    # Get all files from active users
    files = File.query.filter(File.user_id.in_(active_user_ids)).all()
    
    # Initialize node storage counters
    node_storage = {}
    
    # Calculate storage per node from chunks
    for file in files:
        chunks_info = file.get_chunks_info()
        if not chunks_info:
            continue
            
        for chunk_key, chunk_info in chunks_info.items():
            node_id = chunk_info.get("node_id")
            chunk_size = chunk_info.get("size", 0)
            
            if node_id:
                if node_id not in node_storage:
                    node_storage[node_id] = 0
                node_storage[node_id] += chunk_size
    
    return node_storage

@app.route('/api/admin/nodes')
@admin_required
def admin_nodes():
    nodes = StorageNode.query.all()
    network_stats = get_storage_service().get_network_stats()
    
    # Calculate actual storage usage per node from active users' files
    node_storage_usage = calculate_node_storage_usage()
    
    nodes_data = []
    storage_svc = get_storage_service()
    for node_db in nodes:
        node_data = node_db.to_dict()
        
        # Get actual used space from calculated storage
        actual_used_space = node_storage_usage.get(node_db.node_id, 0)
        node_capacity = node_db.storage_capacity  # Already in bytes
        
        # Calculate usage percentage
        usage_percent = (actual_used_space / node_capacity * 100) if node_capacity > 0 else 0
        
        node_data['used_space'] = actual_used_space
        node_data['usage_percent'] = usage_percent
        
        nodes_data.append(node_data)
    
    return jsonify({'nodes': nodes_data})

@app.route('/api/admin/nodes', methods=['POST'])
@admin_required
def add_node():
    data = request.get_json()
    node_id = data.get('node_id')
    host = data.get('host', 'localhost')
    port = int(data.get('port', 50053))
    capacity_gb = int(data.get('capacity', 100))
    
    if StorageNode.query.filter_by(node_id=node_id).first():
        return jsonify({'error': 'Node ID already exists'}), 400
    
    node_db = StorageNode(
        node_id=node_id,
        host=host,
        port=port,
        storage_capacity=capacity_gb * 1024 * 1024 * 1024,
        cpu_capacity=4,
        memory_capacity=16,
        bandwidth=1000
    )
    
    db.session.add(node_db)
    db.session.commit()
    
    # Add to network
    get_storage_service().add_node_to_network(node_db)
    
    return jsonify({'success': True})

@app.route('/api/admin/nodes/<node_id>/toggle', methods=['PUT'])
@admin_required
def toggle_node(node_id):
    node_db = StorageNode.query.filter_by(node_id=node_id).first()
    if not node_db:
        return jsonify({'error': 'Node not found'}), 404
    
    node_db.is_active = not node_db.is_active
    db.session.commit()
    
    get_storage_service().update_node_status(node_id, node_db.is_active)
    
    return jsonify({'success': True})

@app.route('/api/admin/nodes/<node_id>/duplicate', methods=['POST'])
@admin_required
def duplicate_node(node_id):
    node_db = StorageNode.query.filter_by(node_id=node_id).first()
    if not node_db:
        return jsonify({'error': 'Node not found'}), 404
    
    new_node_id = request.args.get('new_node_id')
    if not new_node_id:
        return jsonify({'error': 'new_node_id required'}), 400
    
    if StorageNode.query.filter_by(node_id=new_node_id).first():
        return jsonify({'error': 'Node ID already exists'}), 400
    
    new_node = StorageNode(
        node_id=new_node_id,
        host=node_db.host,
        port=node_db.port + 1,
        storage_capacity=node_db.storage_capacity,
        cpu_capacity=node_db.cpu_capacity,
        memory_capacity=node_db.memory_capacity,
        bandwidth=node_db.bandwidth,
        is_active=node_db.is_active
    )
    
    db.session.add(new_node)
    db.session.commit()
    
    get_storage_service().add_node_to_network(new_node)
    
    return jsonify({'success': True})

@app.route('/api/admin/nodes/<node_id>', methods=['DELETE'])
@admin_required
def delete_node(node_id):
    node_db = StorageNode.query.filter_by(node_id=node_id).first()
    if not node_db:
        return jsonify({'error': 'Node not found'}), 404
    
    # Remove from network
    storage_svc = get_storage_service()
    if node_id in storage_svc.network.nodes:
        del storage_svc.network.nodes[node_id]
    
    db.session.delete(node_db)
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/admin/change-username', methods=['POST'])
@admin_required
def change_admin_username():
    admin = Admin.query.get(session['admin_id'])
    data = request.get_json()
    new_username = data.get('new_username', '').strip()
    
    if not new_username:
        return jsonify({'error': 'Username is required'}), 400
    
    if len(new_username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    
    # Check if username already exists
    existing_admin = Admin.query.filter_by(username=new_username).first()
    if existing_admin and existing_admin.id != admin.id:
        return jsonify({'error': 'Username already exists'}), 400
    
    admin.username = new_username
    db.session.commit()
    
    # Clear session to force re-login with new username
    session.clear()
    
    return jsonify({'success': True})

@app.route('/api/admin/delete-account', methods=['DELETE'])
@admin_required
def delete_admin_account():
    admin = Admin.query.get(session['admin_id'])
    data = request.get_json()
    password = data.get('password')
    
    if not password:
        return jsonify({'error': 'Password is required'}), 400
    
    if not admin.check_password(password):
        return jsonify({'error': 'Incorrect password'}), 400
    
    # Check if this is the last admin
    admin_count = Admin.query.count()
    if admin_count <= 1:
        return jsonify({'error': 'Cannot delete the last admin account'}), 400
    
    # Delete the admin account
    db.session.delete(admin)
    db.session.commit()
    
    # Clear session
    session.clear()
    
    return jsonify({'success': True})

@app.route('/api/admin/change-password', methods=['POST'])
@admin_required
def change_admin_password():
    admin = Admin.query.get(session['admin_id'])
    data = request.get_json()
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    
    if not admin.check_password(old_password):
        return jsonify({'error': 'Current password is incorrect'}), 400
    
    admin.set_password(new_password)
    admin.password_changed = True
    db.session.commit()
    
    # Clear the default password flag if it exists
    session.pop('default_password_used', None)
    
    return jsonify({'success': True})

# ========== INITIALIZE DATABASE ==========

def init_db():
    """Initialize database with default data"""
    with app.app_context():
        db.create_all()
        
        # Create default admin if not exists
        if not Admin.query.filter_by(username='admin').first():
            admin = Admin(username='admin')
            admin.set_password('Admin@123')
            admin.password_changed = False
            db.session.add(admin)
            db.session.commit()
        
        # Create default storage nodes if none exist
        if StorageNode.query.count() == 0:
            node1 = StorageNode(
                node_id='node1',
                host='localhost',
                port=50051,
                storage_capacity=500 * 1024 * 1024 * 1024,  # 500GB
                cpu_capacity=4,
                memory_capacity=16,
                bandwidth=1000
            )
            node2 = StorageNode(
                node_id='node2',
                host='localhost',
                port=50052,
                storage_capacity=1000 * 1024 * 1024 * 1024,  # 1TB
                cpu_capacity=8,
                memory_capacity=32,
                bandwidth=2000
            )
            db.session.add(node1)
            db.session.add(node2)
            db.session.commit()
            
            # Add to network (initialize storage service first)
            storage_svc = get_storage_service()
            storage_svc.add_node_to_network(node1)
            storage_svc.add_node_to_network(node2)
        
        # Reload nodes from database
        get_storage_service()._load_nodes_from_db()

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)

