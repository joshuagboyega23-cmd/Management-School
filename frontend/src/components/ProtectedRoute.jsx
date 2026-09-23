import React from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  let user = null;
  try {
    user = userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    user = null;
  }

  // Check if token is expired (basic base64 payload decode)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return <Navigate to="/login" replace />;
    }
  } catch (e) {
    // If token is malformed
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    if (!user || !allowedRoles.includes(user.role)) {
      // Redirect to their respective role dashboard
      if (user?.role === 'STUDENT') return <Navigate to="/student" replace />;
      if (user?.role === 'PARENT') return <Navigate to="/parent" replace />;
      if (user?.role === 'TEACHER') return <Navigate to="/teacher" replace />;
      if (user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') return <Navigate to="/admin" replace />;
      return <Navigate to="/login" replace />;
    }
  }

  return children;
}

