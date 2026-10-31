import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { useAuth, homeFor } from '../../auth/AuthContext';
import { toApiError } from '../../api/client';
import { AuthShell, AuthInput, AuthSubmitButton } from '@/components/ui/auth-card';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: 'admin@brightloop.test',
      password: 'Demo@12345',
    },
  });

  const onSubmit = async (data) => {
    try {
      setServerError('');
      setSubmitting(true);
      const user = await login(data.email, data.password);
      const next = searchParams.get('next') || homeFor(user.role);
      navigate(next, { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      setServerError(apiErr.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome Back"
      subtitle="Sign in to continue to Mobius"
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium text-white transition-colors hover:text-white/70">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-3">
          <AuthInput
            icon={Mail}
            type="email"
            id="email"
            placeholder="Email address"
            autoComplete="email"
            aria-label="Email address"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address',
              },
            })}
          />

          <AuthInput
            icon={Lock}
            type="password"
            id="password"
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
            error={errors.password?.message}
            {...register('password', { required: 'Password is required' })}
          />
        </div>

        <div className="flex justify-end pt-1 text-xs">
          <Link to="/forgot-password" className="text-white/60 transition-colors hover:text-white">
            Forgot password?
          </Link>
        </div>

        {serverError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {serverError}
          </div>
        )}

        <AuthSubmitButton loading={submitting}>Sign In</AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
