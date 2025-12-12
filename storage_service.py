import os
import hashlib
import time
from typing import Dict, List, Optional, Tuple
from storage_virtual_network import StorageVirtualNetwork
from storage_virtual_node import StorageVirtualNode
from models import StorageNode, db

class StorageService:
    def __init__(self):
        self.network = StorageVirtualNetwork()
        # Don't load nodes here - will be loaded when app context is available
        try:
            self._load_nodes_from_db()
        except RuntimeError:
            # No app context yet, will load later
            pass
    
    def _load_nodes_from_db(self):
        """Load storage nodes from database and add to network"""
        try:
            nodes = StorageNode.query.all()
        except RuntimeError:
            # No app context available
            return
        for node_db in nodes:
            # Check if node already exists in network
            if node_db.node_id not in self.network.nodes:
                node = StorageVirtualNode(
                    node_id=node_db.node_id,
                    cpu_capacity=node_db.cpu_capacity,
                    memory_capacity=node_db.memory_capacity,
                    storage_capacity=node_db.storage_capacity // (1024 * 1024 * 1024),  # Convert bytes to GB
                    bandwidth=node_db.bandwidth
                )
                node.is_active = node_db.is_active
                self.network.add_node(node)
        
        # Connect all active nodes to each other
        active_nodes = [n for n in self.network.nodes.values() if n.is_active]
        for i, node1 in enumerate(active_nodes):
            for node2 in active_nodes[i+1:]:
                if node2.node_id not in node1.connections:
                    self.network.connect_nodes(node1.node_id, node2.node_id, min(node1.bandwidth, node2.bandwidth) // 1000000)
    
    def _select_storage_nodes(self, file_size: int, num_chunks: int) -> List[str]:
        """Select nodes for storing file chunks"""
        active_nodes = [n for n in self.network.nodes.values() if n.is_active]
        if not active_nodes:
            return []
        
        # Simple round-robin distribution
        selected_nodes = []
        for i in range(num_chunks):
            node = active_nodes[i % len(active_nodes)]
            selected_nodes.append(node.node_id)
        
        return selected_nodes
    
    def store_file(self, file_data: bytes, file_name: str, file_size: int) -> Tuple[Optional[str], Dict]:
        """
        Store file across multiple nodes
        Returns: (file_id, chunks_info)
        """
        active_nodes = [n for n in self.network.nodes.values() if n.is_active]
        if not active_nodes:
            return None, {}
        
        # Generate unique file ID
        file_id = hashlib.md5(f"{file_name}-{time.time()}".encode()).hexdigest()
        
        # Calculate chunk size
        chunk_size = self._calculate_chunk_size(file_size)
        num_chunks = (file_size + chunk_size - 1) // chunk_size
        
        # Select nodes for chunks
        selected_nodes = self._select_storage_nodes(file_size, num_chunks)
        
        # Distribute chunks across nodes
        chunks_info = {}
        chunk_index = 0
        
        for i, node_id in enumerate(selected_nodes):
            if node_id not in self.network.nodes:
                continue
            
            node = self.network.nodes[node_id]
            start_byte = i * chunk_size
            end_byte = min(start_byte + chunk_size, file_size)
            chunk_data = file_data[start_byte:end_byte]
            
            # Initiate transfer to node
            transfer = node.initiate_file_transfer(
                file_id=f"{file_id}-chunk-{i}",
                file_name=f"{file_name}.chunk{i}",
                file_size=len(chunk_data),
                source_node=None
            )
            
            if transfer:
                # Process all chunks immediately (simplified for web app)
                for chunk in transfer.chunks:
                    node.process_chunk_transfer(transfer.file_id, chunk.chunk_id, node_id)
                
                chunks_info[f"chunk_{i}"] = {
                    "node_id": node_id,
                    "chunk_id": i,
                    "size": len(chunk_data),
                    "file_id": transfer.file_id
                }
        
        return file_id, chunks_info
    
    def retrieve_file(self, file_id: str, chunks_info: Dict) -> Optional[bytes]:
        """
        Retrieve file chunks from nodes and reassemble
        Returns: file data as bytes
        """
        chunks_data = {}
        
        # Retrieve each chunk from its node
        for chunk_key, chunk_info in chunks_info.items():
            node_id = chunk_info.get("node_id")
            chunk_file_id = chunk_info.get("file_id")
            
            if node_id not in self.network.nodes:
                continue
            
            node = self.network.nodes[node_id]
            
            # Check if file exists in node
            if chunk_file_id in node.stored_files:
                transfer = node.stored_files[chunk_file_id]
                chunk_id = chunk_info.get("chunk_id", 0)
                
                # Get chunk size
                if transfer.chunks:
                    chunk_size = transfer.chunks[0].size if transfer.chunks else 0
                    chunks_data[chunk_id] = b'\x00' * chunk_size  # Placeholder - in real system, retrieve actual data
        
        # Reassemble file in order
        if not chunks_data:
            return None
        
        # Sort chunks by ID and combine
        sorted_chunks = sorted(chunks_data.items())
        file_data = b''.join([chunk_data for _, chunk_data in sorted_chunks])
        
        return file_data
    
    def delete_file(self, file_id: str, chunks_info: Dict) -> bool:
        """Delete file chunks from nodes"""
        success = True
        
        for chunk_key, chunk_info in chunks_info.items():
            node_id = chunk_info.get("node_id")
            chunk_file_id = chunk_info.get("file_id")
            
            if node_id not in self.network.nodes:
                continue
            
            node = self.network.nodes[node_id]
            
            # Remove from stored files
            if chunk_file_id in node.stored_files:
                transfer = node.stored_files[chunk_file_id]
                node.used_storage -= transfer.total_size
                del node.stored_files[chunk_file_id]
        
        return success
    
    def _calculate_chunk_size(self, file_size: int) -> int:
        """Calculate optimal chunk size"""
        if file_size < 10 * 1024 * 1024:  # < 10MB
            return 512 * 1024  # 512KB
        elif file_size < 100 * 1024 * 1024:  # < 100MB
            return 2 * 1024 * 1024  # 2MB
        else:
            return 10 * 1024 * 1024  # 10MB
    
    def get_network_stats(self) -> Dict:
        """Get network statistics"""
        return self.network.get_network_stats()
    
    def add_node_to_network(self, node_db: StorageNode):
        """Add a new node to the network"""
        node = StorageVirtualNode(
            node_id=node_db.node_id,
            cpu_capacity=node_db.cpu_capacity,
            memory_capacity=node_db.memory_capacity,
            storage_capacity=node_db.storage_capacity // (1024 * 1024 * 1024),
            bandwidth=node_db.bandwidth
        )
        node.is_active = node_db.is_active
        self.network.add_node(node)
        
        # Connect to other active nodes
        active_nodes = [n for n in self.network.nodes.values() if n.is_active and n.node_id != node_db.node_id]
        for other_node in active_nodes:
            self.network.connect_nodes(node_db.node_id, other_node.node_id, min(node.bandwidth, other_node.bandwidth) // 1000000)
    
    def update_node_status(self, node_id: str, is_active: bool):
        """Update node active status"""
        if node_id in self.network.nodes:
            self.network.nodes[node_id].is_active = is_active

