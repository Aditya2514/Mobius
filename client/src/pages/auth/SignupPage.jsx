import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { User, Building2, Mail, Lock, Check } from 'lucide-react';
import { api, toApiError } from '../../api/client';
import { useAuth, homeFor } from '../../auth/AuthContext';
import { PASSWORD_CHECKS, signupSchema } from '../../auth/passwordRules';
import { AuthShell, AuthInput, AuthSubmitButton } from '@/components/ui/auth-card';

export default function SignupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordVal, setPasswordVal] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      companyName: '',
      email: '',
      password: '',
      confirm: '',
    },
    mode: 'onChange',
  });

  const passwordRegister = register('password');

  const onSubmit = async (data) => {
    try {
      setServerError('');
      setSubmitting(true);
      await api.post('/auth/signup', {
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        companyName: data.companyName || undefined,
      });
      // Auto-login after sign-up
      const user = await login(data.email, data.password);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      setServerError(apiErr.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create Account"
      subtitle="Start managing subscriptions with Mobius"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-white transition-colors hover:text-white/70">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <AuthInput
          icon={User}
          type="text"
          id="fullName"
          placeholder="Full Name *"
          autoComplete="name"
          aria-label="Full Name"
          error={errors.fullName?.message}
          {...register('fullName')}
        />

        <AuthInput
          icon={Building2}
          type="text"
          id="companyName"
          placeholder="Company Name (Optional)"
          autoComplete="organization"
          aria-label="Company Name"
          error={errors.companyName?.message}
          {...register('companyName')}
        />

        <AuthInput
          icon={Mail}
          type="email"
          id="email"
          placeholder="Email address *"
          autoComplete="email"
          aria-label="Email address"
          error={errors.email?.message}
          {...register('email')}
        />

        <AuthInput
          icon={Lock}
          type="password"
          id="password"
          placeholder="Password *"
          autoComplete="new-password"
          aria-label="Password"
          error={errors.password?.message}
          {...passwordRegister}
          onChange={(e) => {
            passwordRegister.onChange(e);
            setPasswordVal(e.target.value);
          }}
        />

        {/* Live Password Requirements Checklist */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-xs">
          <p className="mb-2 font-medium text-white/70">Password must contain:</p>
          <div className="grid grid-cols-2 gap-2">
            {PASSWORD_CHECKS.map((check) => {
              const passed = check.test(passwordVal);
              return (
                <div key={check.id} className="flex items-center gap-2 py-0.5">
                  {passed ? (
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-all duration-200">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded-full border border-white/30 transition-all duration-200" />
                  )}
                  <span
                    className={`text-xs transition-colors duration-200 ${
                      passed ? 'font-medium text-white' : 'text-white/40'
                    }`}
                  >
                    {check.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <AuthInput
          icon={Lock}
          type="password"
          id="confirm"
          placeholder="Confirm Password *"
          autoComplete="new-password"
          aria-label="Confirm Password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />

        {serverError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {serverError}
          </div>
        )}

        <AuthSubmitButton loading={submitting}>Sign Up</AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
