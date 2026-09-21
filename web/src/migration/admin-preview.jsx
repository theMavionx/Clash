// Local browser test entry only; not part of the production Rollup entries.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MigrationAdmin from '../admin/MigrationAdmin';
import '../admin/admin.css';
createRoot(document.getElementById('admin-root')).render(<div style={{ padding: 20, height: '100vh', overflow: 'auto' }}><MigrationAdmin/></div>);
