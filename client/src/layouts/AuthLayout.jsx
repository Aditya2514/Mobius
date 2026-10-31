import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth, homeFor } from '../auth/AuthContext';

export default function AuthLayout() {
  const { user, loading } = useAuth();

  // If already logged in, redirect to respective home
  if (!loading && user) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return <Outlet />;
}
