import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Check } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { api, toApiError } from '../../api/client';
import { PASSWORD_CHECKS, passwordSchema } from '../../auth/passwordRules';
import { AuthShell, AuthInput, AuthSubmitButton } from '@/components/ui/auth-card';

const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordVal, setPasswordVal] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
    mode: 'onChange',
  });

  const passwordRegister = register('password');

  const onSubmit = async (data) => {
    if (!token) {
      setServerError('Reset token is missing or invalid.');
      return;
    }

    try {
      setServerError('');
      setSubmitting(true);
      await api.post('/auth/reset-password', {
        token,
        password: data.password,
      });
      enqueueSnackbar('Password reset successfully! Please sign in with your new password.', {
        variant: 'success',
      });
      navigate('/login');
    } catch (err) {
      const apiErr = toApiError(err);
      setServerError(apiErr.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set New Password"
      subtitle="Choose a strong password for your account"
      footer={
        <>
          Back to{' '}
          <Link to="/login" className="font-medium text-white transition-colors hover:text-white/70">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!token && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Reset token is missing. Please check the link from your email.
          </div>
        )}

        <AuthInput
          icon={Lock}
          type="password"
          id="password"
          placeholder="New password *"
          autoComplete="new-password"
          aria-label="New password"
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
          placeholder="Confirm new password *"
          autoComplete="new-password"
          aria-label="Confirm new password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />

        {serverError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {serverError}
          </div>
        )}

        <AuthSubmitButton loading={submitting} disabled={submitting || !token}>
          Update Password
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
