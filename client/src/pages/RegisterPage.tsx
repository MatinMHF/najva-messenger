import React from 'react';
import AuthShell from '../components/auth/AuthShell';
import RegisterForm from '../components/auth/RegisterForm';

const RegisterPage: React.FC = () => (
  <AuthShell>
    <RegisterForm />
  </AuthShell>
);

export default RegisterPage;
