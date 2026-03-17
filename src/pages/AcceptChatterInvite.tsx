/**
 * AcceptChatterInvite — /accept-chatter-invite
 *
 * Page publique accessible via le lien d'invitation envoyé par email.
 * ?token=<invitation_token>
 *
 * Flux :
 *  1. Charge les infos de l'invitation depuis chatter_invitations
 *  2. Si fan non connecté → affiche formulaire signup/login
 *  3. Une fois connecté → appelle RPC accept_chatter_invitation
 *  4. Redirige vers /app/chatter (Phase 5)
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import logo from '@/assets/logo-white.svg';

interface InvitationInfo {
  id: string;
  email: string;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  expires_at: string;
  status: string;
}

type PageState = 'loading' | 'invalid' | 'expired' | 'already_used' | 'auth' | 'accepting' | 'success';

export default function AcceptChatterInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setPageState('invalid');
        return;
      }

      // Vérifier la session courante
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({ id: user.id, email: user.email ?? '' });
      }

      // Charger l'invitation via RPC (SECURITY DEFINER — fonctionne sans auth,
      // le token agit comme autorisation)
      const { data: rpcResult, error } = await supabase.rpc('get_chatter_invitation_by_token', {
        p_token: token,
      });

      if (error || !rpcResult || rpcResult.error) {
        setPageState('invalid');
        return;
      }

      const inv: InvitationInfo = {
        id: rpcResult.id,
        email: rpcResult.email,
        creator_display_name: rpcResult.creator_display_name ?? null,
        creator_avatar_url: rpcResult.creator_avatar_url ?? null,
        expires_at: rpcResult.expires_at,
        status: rpcResult.status,
      };

      if (inv.status === 'accepted') {
        setInvitation(inv);
        setPageState('already_used');
        return;
      }

      if (inv.status === 'revoked' || new Date(inv.expires_at) < new Date()) {
        setInvitation(inv);
        setPageState('expired');
        return;
      }

      setInvitation(inv);
      setEmail(inv.email ?? '');

      if (user) {
        setPageState('auth'); // L'utilisateur est connecté, on peut accepter directement
      } else {
        setPageState('auth');
      }
    };

    init();
  }, [token]);

  const handleAccept = async (userId: string) => {
    setPageState('accepting');
    try {
      const { error } = await supabase.rpc('accept_chatter_invitation', {
        p_token: token,
      });

      if (error) throw error;

      setPageState('success');
      toast.success('Invitation acceptée ! Tu peux maintenant accéder au dashboard chatter.');

      setTimeout(() => {
        navigate('/app/chatter');
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de l\'acceptation');
      setPageState('auth');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        if (!displayName) {
          toast.error('Entre ton prénom ou pseudo');
          return;
        }
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { is_creator: false, full_name: displayName },
          },
        });
        if (error) throw error;
        if (signUpData.user) {
          setCurrentUser({ id: signUpData.user.id, email: signUpData.user.email ?? '' });
          await handleAccept(signUpData.user.id);
        }
      } else {
        const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (loginData.user) {
          setCurrentUser({ id: loginData.user.id, email: loginData.user.email ?? '' });
          await handleAccept(loginData.user.id);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erreur d\'authentification');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const creatorName = invitation?.creator_display_name || 'un créateur';

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0a0a0f] to-black text-white flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <a href="/" className="mb-10">
        <img src={logo} alt="Exclu" className="h-6 w-auto" />
      </a>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* ── Loading ── */}
        {pageState === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
            <p className="text-sm text-white/60">Vérification de l'invitation…</p>
          </div>
        )}

        {/* ── Invalid ── */}
        {pageState === 'invalid' && (
          <div className="text-center space-y-4 py-12">
            <XCircle className="w-12 h-12 text-red-400/70 mx-auto" />
            <h1 className="text-xl font-bold text-white">Lien invalide</h1>
            <p className="text-sm text-white/50">Ce lien d'invitation est introuvable ou incorrect.</p>
            <Button variant="outline" className="mt-4 border-white/10 text-white/70" onClick={() => navigate('/')}>
              Retour à l'accueil
            </Button>
          </div>
        )}

        {/* ── Expired / Revoked ── */}
        {pageState === 'expired' && (
          <div className="text-center space-y-4 py-12">
            <XCircle className="w-12 h-12 text-yellow-400/70 mx-auto" />
            <h1 className="text-xl font-bold text-white">Invitation expirée</h1>
            <p className="text-sm text-white/50">
              Cette invitation n'est plus valide. Demande au créateur de t'en envoyer une nouvelle.
            </p>
            <Button variant="outline" className="mt-4 border-white/10 text-white/70" onClick={() => navigate('/')}>
              Retour à l'accueil
            </Button>
          </div>
        )}

        {/* ── Already used ── */}
        {pageState === 'already_used' && (
          <div className="text-center space-y-4 py-12">
            <CheckCircle2 className="w-12 h-12 text-green-400/70 mx-auto" />
            <h1 className="text-xl font-bold text-white">Déjà accepté</h1>
            <p className="text-sm text-white/50">Cette invitation a déjà été utilisée.</p>
            <Button className="mt-4" onClick={() => navigate('/app/chatter')}>
              Aller au dashboard chatter
            </Button>
          </div>
        )}

        {/* ── Success ── */}
        {pageState === 'success' && (
          <div className="text-center space-y-4 py-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
            </motion.div>
            <h1 className="text-xl font-bold text-white">Bienvenue dans l'équipe !</h1>
            <p className="text-sm text-white/60">Redirection vers le dashboard chatter…</p>
            <Loader2 className="w-4 h-4 animate-spin text-white/40 mx-auto mt-2" />
          </div>
        )}

        {/* ── Accepting ── */}
        {pageState === 'accepting' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
            <p className="text-sm text-white/60">Activation de ton accès chatter…</p>
          </div>
        )}

        {/* ── Auth ── */}
        {pageState === 'auth' && invitation && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
            {/* Header invitation */}
            <div className="p-6 border-b border-white/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                {invitation.creator_avatar_url ? (
                  <img src={invitation.creator_avatar_url} alt={creatorName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-white/40" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {creatorName} t'invite à rejoindre son équipe
                </p>
              </div>
            </div>

            {/* Si déjà connecté → bouton direct */}
            {currentUser ? (
              <div className="p-6 space-y-4">
                <p className="text-sm text-white/70">
                  Connecté en tant que <span className="font-medium text-white">{currentUser.email}</span>
                </p>
                <Button
                  className="w-full"
                  onClick={() => handleAccept(currentUser.id)}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Accepter l'invitation
                </Button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Tabs login/signup */}
                <div className="flex gap-1 bg-white/5 rounded-xl p-1">
                  {(['login', 'signup'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAuthMode(m)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        authMode === m ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'
                      }`}
                    >
                      {m === 'login' ? 'Se connecter' : 'Créer un compte'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  {authMode === 'signup' && (
                    <Input
                      type="text"
                      placeholder="Prénom ou pseudo"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10"
                      disabled={isAuthSubmitting}
                    />
                  )}
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10"
                    disabled={isAuthSubmitting}
                  />
                  <Input
                    type="password"
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10"
                    disabled={isAuthSubmitting}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!email || !password || isAuthSubmitting}
                  >
                    {isAuthSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    {authMode === 'login' ? 'Connexion et accepter' : 'Créer mon compte et accepter'}
                  </Button>
                </form>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
