import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ReportCardManager = () => {
    const [grades, setGrades] = useState([]);
    const [formData, setFormData] = useState({ subject_name: '', score: '' });
    const [editingId, setEditingId] = useState(null); // Controla si estamos editando

    const fetchGrades = async () => {
        const res = await axios.get('/api/reports/details-list');
        setGrades(res.data);
    };

    useEffect(() => { fetchGrades(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (editingId) {
            // Lógica para ACTUALIZAR
            await axios.put(`/api/reports/detail/${editingId}`, formData);
            setEditingId(null);
        } else {
            // Lógica para AGREGAR
            await axios.post('/api/reports/add', formData);
        }
        setFormData({ subject_name: '', score: '' });
        fetchGrades(); // Refresca la lista y las gráficas
    };

    const handleEdit = (grade) => {
        setEditingId(grade.id);
        setFormData({ subject_name: grade.subject_name, score: grade.score });
    };

    return (
        <div className="p-6">
            {/* FORMULARIO MEJORADO */}
            <form onSubmit={handleSubmit} className="mb-8 p-6 bg-white rounded-xl shadow-lg border-l-4 border-indigo-500">
                <h3 className="text-xl font-bold mb-4">{editingId ? 'Actualizar Materia' : 'Agregar Calificación'}</h3>
                <div className="flex gap-4">
                    <input 
                        className="flex-1 p-2 border rounded"
                        placeholder="Nombre de la Materia (ej: Física)"
                        value={formData.subject_name}
                        onChange={(e) => setFormData({...formData, subject_name: e.target.value})}
                    />
                    <input 
                        type="number"
                        className="w-24 p-2 border rounded"
                        value={formData.score}
                        onChange={(e) => setFormData({...formData, score: e.target.value})}
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700">
                        {editingId ? 'GUARDAR CAMBIOS' : 'Agregar Calificación'}
                    </button>
                    {editingId && (
                        <button type="button" onClick={() => {setEditingId(null); setFormData({subject_name:'', score:''})}} className="bg-gray-400 text-white px-4 py-2 rounded">
                            Cancelar
                        </button>
                    )}
                </div>
            </form>

            {/* TABLA CON BOTÓN DE EDICIÓN */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="p-4">Estudiante</th>
                            <th className="p-4">Materia</th>
                            <th className="p-4">Nota</th>
                            <th className="p-4">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {grades.map(g => (
                            <tr key={g.id} className="border-t hover:bg-indigo-50 transition-colors">
                                <td className="p-4">{g.first_name} {g.last_name}</td>
                                <td className="p-4 font-bold text-indigo-600">{g.subject_name}</td>
                                <td className="p-4">{g.score}</td>
                                <td className="p-4">
                                    <button 
                                        onClick={() => handleEdit(g)}
                                        className="bg-amber-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-amber-600 shadow-sm"
                                    >
                                        EDITAR / ACTUALIZAR
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
export default ReportCardManager;