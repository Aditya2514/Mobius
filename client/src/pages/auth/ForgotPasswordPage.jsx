import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { AuthShell, AuthInput, AuthSubmitButton } from '@/components/ui/auth-card';

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: { email: '' },
  });

  const onSubmit = async (data) => {
    try {
      setSubmitting(true);
      await api.post('/auth/forgot-password', { email: data.email });
      setSubmitted(true);
    } catch {
      // Per spec: always show 200 / success state so attackers cannot enumerate registered emails
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset Your Password"
      subtitle="Enter your email address and we'll send a recovery link"
      footer={
        <>
          Remember your password?{' '}
          <Link to="/login" className="font-medium text-white transition-colors hover:text-white/70">
            Sign in
          </Link>
        </>
      }
    >
      {submitted ? (
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            If an account exists for that email, a password reset link has been dispatched.
          </div>
          <Link
            to="/login"
            className="inline-block text-xs font-medium text-white/80 transition-colors hover:text-white"
          >
            Return to Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <AuthSubmitButton loading={submitting}>Send Reset Link</AuthSubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
