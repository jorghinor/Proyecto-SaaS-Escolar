// Admin Dashboard Modules for 7 New Entities
// Include this file in dashboard.html: <script src="js/admin-modules.js"></script>

// State management for new entities
const moduleState = {
    schools: { data: [], filtered: [], page: 1, perPage: 10 },
    enrollments: { data: [], filtered: [], page: 1, perPage: 10 },
    schedules: { data: [], filtered: [], page: 1, perPage: 10 },
    announcements: { data: [], filtered: [], page: 1, perPage: 10 },
    parents: { data: [], filtered: [], page: 1, perPage: 10 },
    documents: { data: [], filtered: [], page: 1, perPage: 10 },
    events: { data: [], filtered: [], page: 1, perPage: 10 }
};

// ==================== SCHOOLS MODULE ====================
async function loadSchoolsData() {
    try {
        const search = document.getElementById('school-search')?.value || '';
        const type = document.getElementById('school-filter-type')?.value || '';
        const level = document.getElementById('school-filter-level')?.value || '';
        
        const response = await fetch(`${API_URL}/schools?page=${moduleState.schools.page}&limit=${moduleState.schools.perPage}&search=${search}&school_type=${type}&education_level=${level}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.schools.data = result.data || [];
        moduleState.schools.filtered = moduleState.schools.data;
        renderSchoolsTable();
        updatePagination('schools', result.pagination);
    } catch (err) { console.error('Error loading schools:', err); }
}

function renderSchoolsTable() {
    const tbody = document.getElementById('schools-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = moduleState.schools.filtered.map(s => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 font-medium">${s.name}</td>
            <td class="px-4 py-3">${s.code || '-'}</td>
            <td class="px-4 py-3">${s.school_type || '-'}</td>
            <td class="px-4 py-3">${s.education_level || '-'}</td>
            <td class="px-4 py-3">${s.city || '-'}</td>
            <td class="px-4 py-3">${s.is_active ? 'Activo' : 'Inactivo'}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="editSchool(${s.id})" class="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                <button onclick="deleteSchool(${s.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveSchool() {
    const id = document.getElementById('school-id')?.value;
    const data = {
        name: document.getElementById('school-name')?.value,
        code: document.getElementById('school-code')?.value,
        school_type: document.getElementById('school-type')?.value,
        education_level: document.getElementById('school-level')?.value,
        address: document.getElementById('school-address')?.value,
        phone: document.getElementById('school-phone')?.value,
        email: document.getElementById('school-email')?.value,
        director_name: document.getElementById('school-director')?.value,
        city: document.getElementById('school-city')?.value
    };
    
    try {
        await apiRequest(`/schools${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', data);
        resetSchoolForm();
        loadSchoolsData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function editSchool(id) {
    const school = moduleState.schools.data.find(s => s.id === id);
    if (!school) return;
    
    document.getElementById('school-id').value = school.id;
    document.getElementById('school-name').value = school.name;
    document.getElementById('school-code').value = school.code || '';
    document.getElementById('school-type').value = school.school_type || '';
    document.getElementById('school-level').value = school.education_level || '';
    document.getElementById('school-address').value = school.address || '';
    document.getElementById('school-phone').value = school.phone || '';
    document.getElementById('school-email').value = school.email || '';
    document.getElementById('school-director').value = school.director_name || '';
    document.getElementById('school-city').value = school.city || '';
    document.getElementById('school-form-title').textContent = 'Editar Unidad Educativa';
}

async function deleteSchool(id) {
    if (!confirm('¿Eliminar esta unidad educativa?')) return;
    try {
        await apiRequest(`/schools/${id}`, 'DELETE');
        loadSchoolsData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetSchoolForm() {
    document.getElementById('school-form')?.reset();
    document.getElementById('school-id').value = '';
    document.getElementById('school-form-title').textContent = 'Nueva Unidad Educativa';
}

// ==================== ENROLLMENTS MODULE ====================
async function loadEnrollmentsData() {
    try {
        const search = document.getElementById('enrollment-search')?.value || '';
        const year = document.getElementById('enrollment-filter-year')?.value || '';
        const status = document.getElementById('enrollment-filter-status')?.value || '';
        
        const response = await fetch(`${API_URL}/enrollments?page=${moduleState.enrollments.page}&limit=${moduleState.enrollments.perPage}&search=${search}&academic_year=${year}&status=${status}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.enrollments.data = result.data || [];
        moduleState.enrollments.filtered = moduleState.enrollments.data;
        renderEnrollmentsTable();
        updatePagination('enrollments', result.pagination);
    } catch (err) { console.error('Error loading enrollments:', err); }
}

function renderEnrollmentsTable() {
    const tbody = document.getElementById('enrollments-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = moduleState.enrollments.filtered.map(e => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3">${e.student_name}</td>
            <td class="px-4 py-3">${e.academic_year}</td>
            <td class="px-4 py-3">${e.grade} ${e.section || ''}</td>
            <td class="px-4 py-3">${e.status}</td>
            <td class="px-4 py-3">${e.payment_status}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="editEnrollment(${e.id})" class="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                <button onclick="deleteEnrollment(${e.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveEnrollment() {
    const id = document.getElementById('enrollment-id')?.value;
    const data = {
        student_id: document.getElementById('enrollment-student')?.value,
        academic_year: document.getElementById('enrollment-year')?.value,
        grade: document.getElementById('enrollment-grade')?.value,
        section: document.getElementById('enrollment-section')?.value,
        tuition_fee: document.getElementById('enrollment-fee')?.value,
        status: document.getElementById('enrollment-status')?.value
    };
    
    try {
        await apiRequest(`/enrollments${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', data);
        resetEnrollmentForm();
        loadEnrollmentsData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteEnrollment(id) {
    if (!confirm('¿Eliminar esta matrícula?')) return;
    try {
        await apiRequest(`/enrollments/${id}`, 'DELETE');
        loadEnrollmentsData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetEnrollmentForm() {
    document.getElementById('enrollment-form')?.reset();
    document.getElementById('enrollment-id').value = '';
}

// ==================== SCHEDULES MODULE ====================
async function loadSchedulesData() {
    try {
        const course = document.getElementById('schedule-filter-course')?.value || '';
        const day = document.getElementById('schedule-filter-day')?.value || '';
        
        const response = await fetch(`${API_URL}/schedules?page=${moduleState.schedules.page}&limit=${moduleState.schedules.perPage}&course_id=${course}&day_of_week=${day}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.schedules.data = result.data || [];
        renderSchedulesTable();
        updatePagination('schedules', result.pagination);
    } catch (err) { console.error('Error loading schedules:', err); }
}

function renderSchedulesTable() {
    const tbody = document.getElementById('schedules-table-body');
    if (!tbody) return;
    
    const days = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    
    tbody.innerHTML = moduleState.schedules.data.map(s => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3">${s.course_name}</td>
            <td class="px-4 py-3">${days[s.day_of_week]}</td>
            <td class="px-4 py-3">${s.start_time?.substring(0,5)} - ${s.end_time?.substring(0,5)}</td>
            <td class="px-4 py-3">${s.classroom || '-'}</td>
            <td class="px-4 py-3">${s.teacher_name || '-'}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="editSchedule(${s.id})" class="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                <button onclick="deleteSchedule(${s.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveSchedule() {
    const id = document.getElementById('schedule-id')?.value;
    const data = {
        course_id: document.getElementById('schedule-course')?.value,
        teacher_id: document.getElementById('schedule-teacher')?.value,
        day_of_week: document.getElementById('schedule-day')?.value,
        start_time: document.getElementById('schedule-start')?.value,
        end_time: document.getElementById('schedule-end')?.value,
        classroom: document.getElementById('schedule-classroom')?.value,
        academic_year: document.getElementById('schedule-year')?.value
    };
    
    try {
        await apiRequest(`/schedules${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', data);
        resetScheduleForm();
        loadSchedulesData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteSchedule(id) {
    if (!confirm('¿Eliminar este horario?')) return;
    try {
        await apiRequest(`/schedules/${id}`, 'DELETE');
        loadSchedulesData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetScheduleForm() {
    document.getElementById('schedule-form')?.reset();
    document.getElementById('schedule-id').value = '';
}

// ==================== ANNOUNCEMENTS MODULE ====================
async function loadAnnouncementsData() {
    try {
        const search = document.getElementById('announcement-search')?.value || '';
        const category = document.getElementById('announcement-filter-category')?.value || '';
        
        const response = await fetch(`${API_URL}/announcements?page=${moduleState.announcements.page}&limit=${moduleState.announcements.perPage}&search=${search}&category=${category}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.announcements.data = result.data || [];
        renderAnnouncementsTable();
        updatePagination('announcements', result.pagination);
    } catch (err) { console.error('Error loading announcements:', err); }
}

function renderAnnouncementsTable() {
    const tbody = document.getElementById('announcements-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = moduleState.announcements.data.map(a => `
        <tr class="hover:bg-gray-50 ${a.is_pinned ? 'bg-yellow-50' : ''}">
            <td class="px-4 py-3 font-medium">${a.is_pinned ? '📌 ' : ''}${a.title}</td>
            <td class="px-4 py-3">${a.category}</td>
            <td class="px-4 py-3">${a.priority}</td>
            <td class="px-4 py-3">${a.views_count}</td>
            <td class="px-4 py-3">${new Date(a.created_at).toLocaleDateString()}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="editAnnouncement(${a.id})" class="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                <button onclick="deleteAnnouncement(${a.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveAnnouncement() {
    const id = document.getElementById('announcement-id')?.value;
    const data = {
        title: document.getElementById('announcement-title')?.value,
        content: document.getElementById('announcement-content')?.value,
        category: document.getElementById('announcement-category')?.value,
        priority: document.getElementById('announcement-priority')?.value,
        target_audience: document.getElementById('announcement-target')?.value,
        is_pinned: document.getElementById('announcement-pinned')?.checked
    };
    
    try {
        await apiRequest(`/announcements${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', data);
        resetAnnouncementForm();
        loadAnnouncementsData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteAnnouncement(id) {
    if (!confirm('¿Eliminar este comunicado?')) return;
    try {
        await apiRequest(`/announcements/${id}`, 'DELETE');
        loadAnnouncementsData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetAnnouncementForm() {
    document.getElementById('announcement-form')?.reset();
    document.getElementById('announcement-id').value = '';
}

// ==================== PARENTS MODULE ====================
async function loadParentsData() {
    try {
        const search = document.getElementById('parent-search')?.value || '';
        const response = await fetch(`${API_URL}/parents?page=${moduleState.parents.page}&limit=${moduleState.parents.perPage}&search=${search}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.parents.data = result.data || [];
        renderParentsTable();
        updatePagination('parents', result.pagination);
    } catch (err) { console.error('Error loading parents:', err); }
}

function renderParentsTable() {
    const tbody = document.getElementById('parents-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = moduleState.parents.data.map(p => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3">${p.first_name} ${p.last_name}</td>
            <td class="px-4 py-3">${p.relationship}</td>
            <td class="px-4 py-3">${p.phone}</td>
            <td class="px-4 py-3">${p.email || '-'}</td>
            <td class="px-4 py-3">${p.student_name || '<span class="text-gray-400 italic">No asignado</span>'}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="editParent(${p.id})" class="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                <button onclick="deleteParent(${p.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveParent() {
    const id = document.getElementById('parent-id')?.value;
    const data = {
        first_name: document.getElementById('parent-firstname')?.value,
        last_name: document.getElementById('parent-lastname')?.value,
        relationship: document.getElementById('parent-relationship')?.value,
        phone: document.getElementById('parent-phone')?.value,
        email: document.getElementById('parent-email')?.value,
        password: document.getElementById('parent-password')?.value,
        address: document.getElementById('parent-address')?.value,
        student_id: document.getElementById('parent-student')?.value
    };
    
    try {
        await apiRequest(`/parents${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', data);
        resetParentForm();
        loadParentsData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function editParent(id) {
    const parent = moduleState.parents.data.find(p => p.id === id);
    if (!parent) return;

    document.getElementById('parent-id').value = parent.id;
    document.getElementById('parent-firstname').value = parent.first_name;
    document.getElementById('parent-lastname').value = parent.last_name;
    document.getElementById('parent-relationship').value = parent.relationship || '';
    document.getElementById('parent-phone').value = parent.phone || '';
    document.getElementById('parent-email').value = parent.email || '';
    document.getElementById('parent-address').value = parent.address || '';

    if (document.getElementById('parent-student')) {
        document.getElementById('parent-student').value = parent.student_id || '';
    }

    // Cambiar el título del formulario si existe
    const title = document.getElementById('parent-form-title');
    if (title) title.textContent = 'Editar Tutor';
}

async function deleteParent(id) {
    if (!confirm('¿Eliminar este tutor?')) return;
    try {
        await apiRequest(`/parents/${id}`, 'DELETE');
        loadParentsData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetParentForm() {
    document.getElementById('parent-form')?.reset();
    document.getElementById('parent-id').value = '';
    const title = document.getElementById('parent-form-title');
    if (title) title.textContent = 'Nuevo Tutor';
}

// ==================== DOCUMENTS MODULE ====================
async function loadDocumentsData() {
    try {
        const student = document.getElementById('document-filter-student')?.value || '';
        const response = await fetch(`${API_URL}/documents?page=${moduleState.documents.page}&limit=${moduleState.documents.perPage}&student_id=${student}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.documents.data = result.data || [];
        renderDocumentsTable();
        updatePagination('documents', result.pagination);
    } catch (err) { console.error('Error loading documents:', err); }
}

function renderDocumentsTable() {
    const tbody = document.getElementById('documents-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = moduleState.documents.data.map(d => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3">${d.student_name}</td>
            <td class="px-4 py-3">${d.document_type}</td>
            <td class="px-4 py-3">${d.document_name}</td>
            <td class="px-4 py-3">${d.is_verified ? '✅' : '⏳'}</td>
            <td class="px-4 py-3 text-center">
                <a href="${d.file_url}" target="_blank" class="text-blue-600 hover:text-blue-800 mr-2">Ver</a>
                <button onclick="deleteDocument(${d.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveDocument() {
    const data = {
        student_id: document.getElementById('document-student')?.value,
        document_type: document.getElementById('document-type')?.value,
        document_name: document.getElementById('document-name')?.value,
        file_url: document.getElementById('document-url')?.value,
        description: document.getElementById('document-desc')?.value
    };
    
    try {
        await apiRequest('/documents', 'POST', data);
        resetDocumentForm();
        loadDocumentsData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteDocument(id) {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
        await apiRequest(`/documents/${id}`, 'DELETE');
        loadDocumentsData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetDocumentForm() {
    document.getElementById('document-form')?.reset();
}

// ==================== EVENTS MODULE ====================
async function loadEventsData() {
    try {
        const search = document.getElementById('event-search')?.value || '';
        const type = document.getElementById('event-filter-type')?.value || '';
        
        const response = await fetch(`${API_URL}/events?page=${moduleState.events.page}&limit=${moduleState.events.perPage}&search=${search}&event_type=${type}`, {
            headers: { 'auth-token': getToken() }
        });
        const result = await response.json();
        moduleState.events.data = result.data || [];
        renderEventsTable();
        updatePagination('events', result.pagination);
    } catch (err) { console.error('Error loading events:', err); }
}

function renderEventsTable() {
    const tbody = document.getElementById('events-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = moduleState.events.data.map(e => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 font-medium">${e.title}</td>
            <td class="px-4 py-3">${e.event_type}</td>
            <td class="px-4 py-3">${new Date(e.start_date).toLocaleDateString()}</td>
            <td class="px-4 py-3">${e.location || '-'}</td>
            <td class="px-4 py-3">${e.is_holiday ? '🏖️' : ''}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="editEvent(${e.id})" class="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                <button onclick="deleteEvent(${e.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="px-4 py-3 text-center text-gray-500">No hay registros</td></tr>';
}

async function saveEvent() {
    const id = document.getElementById('event-id')?.value;
    const data = {
        title: document.getElementById('event-title')?.value,
        description: document.getElementById('event-desc')?.value,
        event_type: document.getElementById('event-type')?.value,
        start_date: document.getElementById('event-start-date')?.value,
        end_date: document.getElementById('event-end-date')?.value,
        location: document.getElementById('event-location')?.value,
        is_holiday: document.getElementById('event-holiday')?.checked
    };
    
    try {
        await apiRequest(`/events${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', data);
        resetEventForm();
        loadEventsData();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteEvent(id) {
    if (!confirm('¿Eliminar este evento?')) return;
    try {
        await apiRequest(`/events/${id}`, 'DELETE');
        loadEventsData();
    } catch (err) { alert('Error: ' + err.message); }
}

function resetEventForm() {
    document.getElementById('event-form')?.reset();
    document.getElementById('event-id').value = '';
}

// ==================== PAGINATION ====================
function updatePagination(entity, pagination) {
    const pageInfo = document.getElementById(`${entity}-page-info`);
    const prevBtn = document.getElementById(`${entity}-prev`);
    const nextBtn = document.getElementById(`${entity}-next`);
    
    if (pageInfo) pageInfo.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;
}

function changePage(entity, direction) {
    moduleState[entity].page += direction;
    const loadFunc = `load${entity.charAt(0).toUpperCase() + entity.slice(1)}Data`;
    if (typeof window[loadFunc] === 'function') window[loadFunc]();
}

// ==================== FILTER FUNCTIONS ====================
function filterSchools() { moduleState.schools.page = 1; loadSchoolsData(); }
function filterEnrollments() { moduleState.enrollments.page = 1; loadEnrollmentsData(); }
function filterSchedules() { moduleState.schedules.page = 1; loadSchedulesData(); }
function filterAnnouncements() { moduleState.announcements.page = 1; loadAnnouncementsData(); }
function filterParents() { moduleState.parents.page = 1; loadParentsData(); }
function filterDocuments() { moduleState.documents.page = 1; loadDocumentsData(); }
function filterEvents() { moduleState.events.page = 1; loadEventsData(); }

console.log('Admin modules loaded successfully');
