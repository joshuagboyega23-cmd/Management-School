import { useEffect, useState } from 'react';

export default function StudentList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/api/students')
      .then((res) => res.json())
      .then((data) => {
        setStudents(data);
        setLoading(false);
      })
      .catch((err) => console.error('Error fetching students:', err));
  }, []);

  if (loading) return <p>Loading student directory...</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Student Directory</h2>
      <table border="1" cellPadding="10" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Admission No</th>
            <th>Full Name</th>
            <th>Class</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td>{student.id}</td>
              <td>{student.admission_no}</td>
              <td>{student.name}</td>
              <td>{student.class_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}