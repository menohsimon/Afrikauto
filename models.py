from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    plan = db.Column(db.String(20), default='Free', nullable=False)
    storage_quota = db.Column(db.BigInteger, default=5368709120, nullable=False)  # 5GB default
    storage_used = db.Column(db.BigInteger, default=0, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    files = db.relationship('File', backref='user', lazy=True, cascade='all, delete-orphan')
    folders = db.relationship('Folder', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'plan': self.plan,
            'storage_quota': self.storage_quota,
            'storage_used': self.storage_used,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat()
        }

class Admin(db.Model):
    __tablename__ = 'admins'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    password_changed = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class File(db.Model):
    __tablename__ = 'files'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    folder_id = db.Column(db.Integer, db.ForeignKey('folders.id'), nullable=True)
    name = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), nullable=True)
    size = db.Column(db.BigInteger, nullable=False)
    file_id = db.Column(db.String(64), unique=True, nullable=False)  # Virtual network file ID
    chunks_info = db.Column(db.Text, nullable=True)  # JSON string of chunk distribution
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    def set_chunks_info(self, chunks_info):
        self.chunks_info = json.dumps(chunks_info)
    
    def get_chunks_info(self):
        if self.chunks_info:
            return json.loads(self.chunks_info)
        return {}
    
    def to_dict(self):
        return {
            '_id': str(self.id),
            'name': self.name,
            'original_name': self.original_name,
            'mime_type': self.mime_type,
            'size': self.size,
            'file_id': self.file_id,
            'created_at': self.created_at.isoformat()
        }

class Folder(db.Model):
    __tablename__ = 'folders'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('folders.id'), nullable=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    children = db.relationship('Folder', backref=db.backref('parent', remote_side=[id]), lazy=True)
    files = db.relationship('File', backref='folder', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            '_id': str(self.id),
            'name': self.name,
            'parent_id': str(self.parent_id) if self.parent_id else None,
            'created_at': self.created_at.isoformat()
        }

class StorageNode(db.Model):
    __tablename__ = 'storage_nodes'
    
    id = db.Column(db.Integer, primary_key=True)
    node_id = db.Column(db.String(50), unique=True, nullable=False)
    host = db.Column(db.String(100), default='localhost', nullable=False)
    port = db.Column(db.Integer, nullable=False)
    cpu_capacity = db.Column(db.Integer, default=4, nullable=False)
    memory_capacity = db.Column(db.Integer, default=16, nullable=False)
    storage_capacity = db.Column(db.BigInteger, nullable=False)  # in bytes
    bandwidth = db.Column(db.Integer, default=1000, nullable=False)  # in Mbps
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'node_id': self.node_id,
            'host': self.host,
            'port': self.port,
            'cpu_capacity': self.cpu_capacity,
            'memory_capacity': self.memory_capacity,
            'storage_capacity': self.storage_capacity,
            'bandwidth': self.bandwidth,
            'is_active': self.is_active,
            'status': 'Online' if self.is_active else 'Offline'
        }












