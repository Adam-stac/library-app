package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.users.RegistrationEmails.Email;

/** Emails about an existing account, in the account's language. */
final class AccountEmails {

    private AccountEmails() {}

    static Email passwordReset(String language, String link) {
        if ("ar".equals(language)) {
            return new Email("إعادة تعيين كلمة المرور — خِزانة", """
                    السلام عليكم،

                    طلب أحدهم إعادة تعيين كلمة المرور لحسابك في «خِزانة». لاختيار كلمة مرور جديدة، افتح الرابط التالي:
                    %s

                    ينتهي هذا الرابط خلال ساعة واحدة، ولا يُستخدم إلا مرة واحدة.
                    إن لم تطلب ذلك، فتجاهل هذه الرسالة: لن يتغيّر شيء، وتبقى كلمة مرورك الحالية كما هي.
                    """.formatted(link));
        }
        return new Email("Reset your password — Khizāna", """
                Assalamu alaykum,

                Someone asked to reset the password for your Khizāna account. To choose a new password, open this link:
                %s

                The link expires in 1 hour and can only be used once.
                If you didn't ask for this, you can ignore this email: nothing changes and your current password still works.
                """.formatted(link));
    }

    static Email passwordChanged(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تم تغيير كلمة مرورك — خِزانة", """
                    السلام عليكم،

                    تم تغيير كلمة المرور لحسابك في «خِزانة»، وسُجّل خروجك من الأجهزة الأخرى.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Your password was changed — Khizāna", """
                Assalamu alaykum,

                The password for your Khizāna account was just changed, and other devices were signed out.
                If this was you, there's nothing to do.
                If it wasn't you, reset your password straight away here:
                %s
                """.formatted(resetLink));
    }

    static Email twoFactorTurnedOn(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تم تفعيل التحقق بخطوتين — خِزانة", """
                    السلام عليكم،

                    فُعّل التحقق بخطوتين لحسابك في «خِزانة»: سيُطلب منك رمز من تطبيق المصادقة عند كل تسجيل دخول.
                    احفظ رموز الاسترداد في مكان آمن؛ فهي طريقك إلى حسابك إن فقدت هاتفك.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Two-step verification turned on — Khizāna", """
                Assalamu alaykum,

                Two-step verification was turned on for your Khizāna account: signing in now also needs a code from your authenticator app.
                Keep your recovery codes somewhere safe; they get you in if you lose your phone.
                If this wasn't you, reset your password straight away here:
                %s
                """.formatted(resetLink));
    }

    static Email twoFactorTurnedOff(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تم إيقاف التحقق بخطوتين — خِزانة", """
                    السلام عليكم،

                    أُوقف التحقق بخطوتين لحسابك في «خِزانة»، فأصبح تسجيل الدخول بكلمة المرور وحدها.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا، ثم فعّل التحقق بخطوتين من جديد:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Two-step verification turned off — Khizāna", """
                Assalamu alaykum,

                Two-step verification was turned off for your Khizāna account, so signing in now needs only your password.
                If this wasn't you, reset your password straight away here, then turn two-step verification back on:
                %s
                """.formatted(resetLink));
    }

    static Email recoveryCodeUsed(String language, int left, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("استُخدم رمز استرداد — خِزانة", """
                    السلام عليكم،

                    سُجّل الدخول إلى حسابك في «خِزانة» باستخدام رمز استرداد. بقي لديك %d من رموز الاسترداد.
                    إن قلّت رموزك، فأنشئ رموزًا جديدة من صفحة التحقق بخطوتين.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(left, resetLink));
        }
        return new Email("A recovery code was used — Khizāna", """
                Assalamu alaykum,

                Someone signed in to your Khizāna account with a recovery code. You have %d recovery codes left.
                If you're running low, create new ones on the two-step verification page.
                If this wasn't you, reset your password straight away here:
                %s
                """.formatted(left, resetLink));
    }

    static Email newRecoveryCodes(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("رموز استرداد جديدة — خِزانة", """
                    السلام عليكم،

                    أُنشئت رموز استرداد جديدة لحسابك في «خِزانة»، ولم تعد الرموز القديمة صالحة.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("New recovery codes — Khizāna", """
                Assalamu alaykum,

                New recovery codes were created for your Khizāna account, and the old ones no longer work.
                If this wasn't you, reset your password straight away here:
                %s
                """.formatted(resetLink));
    }

    static Email passkeyAdded(String language, String label, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("أُضيف مفتاح مرور — خِزانة", """
                    السلام عليكم،

                    أُضيف مفتاح مرور جديد («%s») إلى حسابك في «خِزانة»، ويمكن استخدامه لتسجيل الدخول دون كلمة مرور.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا، ثم احذف مفتاح المرور من صفحة مفاتيح المرور:
                    %s
                    """.formatted(label, resetLink));
        }
        return new Email("A passkey was added — Khizāna", """
                Assalamu alaykum,

                A new passkey ("%s") was added to your Khizāna account. It can be used to sign in without a password.
                If this was you, there's nothing to do.
                If it wasn't you, reset your password straight away here, then remove the passkey on the passkeys page:
                %s
                """.formatted(label, resetLink));
    }

    static Email passkeyRemoved(String language, String label, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("حُذف مفتاح مرور — خِزانة", """
                    السلام عليكم،

                    حُذف مفتاح المرور «%s» من حسابك في «خِزانة»، فلم يعد صالحًا لتسجيل الدخول.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(label, resetLink));
        }
        return new Email("A passkey was removed — Khizāna", """
                Assalamu alaykum,

                The passkey "%s" was removed from your Khizāna account and can no longer be used to sign in.
                If it wasn't you, reset your password straight away here:
                %s
                """.formatted(label, resetLink));
    }

    static Email newSignIn(String language, String device, String securityLink, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تسجيل دخول جديد إلى حسابك — خِزانة", """
                    السلام عليكم،

                    سُجّل الدخول إلى حسابك في «خِزانة» من جهاز جديد: %s.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    ويمكنك مراجعة نشاط حسابك وتسجيل الخروج من الأجهزة الأخرى من هنا:
                    %s
                    """.formatted(device, resetLink, securityLink));
        }
        return new Email("New sign-in to your account — Khizāna", """
                Assalamu alaykum,

                Someone signed in to your Khizāna account from a new device: %s.
                If this was you, there's nothing to do.
                If it wasn't you, reset your password straight away here:
                %s
                You can review your account's activity and sign out other devices here:
                %s
                """.formatted(device, resetLink, securityLink));
    }

    static Email accountLocked(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("أُوقف تسجيل الدخول إلى حسابك مؤقتًا — خِزانة", """
                    السلام عليكم،

                    أُدخلت كلمة مرور أو رمز خاطئ عدة مرات متتالية، فأوقفنا تسجيل الدخول إلى حسابك في «خِزانة» ١٥ دقيقة لحمايته.
                    إن كنت أنت، فانتظر قليلًا ثم حاول مجددًا.
                    إن لم تكن أنت، فقد يكون أحدهم يحاول تخمين كلمة مرورك. يُستحسن تغييرها من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Sign-in to your account was paused — Khizāna", """
                Assalamu alaykum,

                A wrong password or code was entered several times in a row, so we've paused sign-in to your Khizāna account for 15 minutes to protect it.
                If this was you, wait a little and try again.
                If it wasn't you, someone may be trying to guess your password. It's a good idea to change it here:
                %s
                """.formatted(resetLink));
    }

    static Email confirmNewEmail(String language, String link) {
        if ("ar".equals(language)) {
            return new Email("أكّد عنوان بريدك الجديد — خِزانة", """
                    السلام عليكم،

                    طلب أحدهم أن يصبح هذا العنوان هو البريد الإلكتروني لحسابه في «خِزانة». لتأكيد ذلك، افتح الرابط التالي:
                    %s

                    ينتهي هذا الرابط خلال ساعة واحدة، ولا يُستخدم إلا مرة واحدة.
                    إن لم تطلب ذلك، فتجاهل هذه الرسالة: لن يتغيّر شيء.
                    """.formatted(link));
        }
        return new Email("Confirm your new email address — Khizāna", """
                Assalamu alaykum,

                Someone asked for this to become the email address of their Khizāna account. To confirm, open this link:
                %s

                The link expires in 1 hour and can only be used once.
                If you didn't ask for this, you can ignore this email: nothing will change.
                """.formatted(link));
    }

    static Email emailChangeAddressTaken(String language) {
        if ("ar".equals(language)) {
            return new Email("محاولة استخدام عنوان بريدك — خِزانة", """
                    السلام عليكم،

                    حاول أحدهم نقل حساب آخر في «خِزانة» إلى عنوان بريدك الإلكتروني، ولديك حساب بهذا العنوان بالفعل، فلم يتغيّر شيء.
                    لا داعي لأي إجراء.
                    """);
        }
        return new Email("Someone tried to use your email address — Khizāna", """
                Assalamu alaykum,

                Someone tried to move another Khizāna account to your email address. You already have an account with it, so nothing changed.
                There's nothing you need to do.
                """);
    }

    static Email emailChangeRequested(String language, String maskedNewEmail, String securityLink) {
        if ("ar".equals(language)) {
            return new Email("طلب تغيير بريد حسابك — خِزانة", """
                    السلام عليكم،

                    طُلب تغيير البريد الإلكتروني لحسابك في «خِزانة» إلى %s. لن يتغيّر شيء ما لم يُفتح الرابط المرسَل إلى ذلك العنوان.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأحدهم يعرف كلمة مرورك: غيّرها فورًا، وسجّل الخروج من الأجهزة الأخرى من هنا:
                    %s
                    """.formatted(maskedNewEmail, securityLink));
        }
        return new Email("A change to your account's email was requested — Khizāna", """
                Assalamu alaykum,

                Someone asked to change the email address of your Khizāna account to %s. Nothing changes unless the link sent to that address is opened.
                If this was you, there's nothing to do.
                If it wasn't you, someone knows your password: change it straight away, and sign out other devices here:
                %s
                """.formatted(maskedNewEmail, securityLink));
    }

    static Email emailChanged(String language, String maskedNewEmail) {
        if ("ar".equals(language)) {
            return new Email("تغيّر بريد حسابك — خِزانة", """
                    السلام عليكم،

                    تغيّر البريد الإلكتروني لحسابك في «خِزانة» إلى %s، وسُجّل الخروج من الأجهزة الأخرى. لن تصل رسائل الحساب إلى هذا العنوان بعد الآن.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فقد استولى أحدهم على حسابك. تواصل مع مسؤول الموقع فورًا، واذكر وقت هذه الرسالة.
                    """.formatted(maskedNewEmail));
        }
        return new Email("Your account's email address was changed — Khizāna", """
                Assalamu alaykum,

                The email address of your Khizāna account was changed to %s, and other devices were signed out. Account emails won't come to this address any more.
                If this was you, there's nothing to do.
                If it wasn't you, someone else has taken control of your account. Contact the site's administrator straight away, giving the time of this email.
                """.formatted(maskedNewEmail));
    }

    static Email accountDeleted(String language) {
        if ("ar".equals(language)) {
            return new Email("حُذف حسابك — خِزانة", """
                    السلام عليكم،

                    حُذف حسابك في «خِزانة» وكل ما فيه، بناءً على طلبك. لا يمكن التراجع عن ذلك.
                    يمكنك إنشاء حساب جديد بهذا العنوان متى شئت.
                    """);
        }
        return new Email("Your account was deleted — Khizāna", """
                Assalamu alaykum,

                Your Khizāna account and everything in it were deleted, as you asked. This can't be undone.
                You're welcome to create a new account with this address at any time.
                """);
    }
}
