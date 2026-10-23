package io.github.adamstac.libraryapp.users;

/** Email texts, in the language the person chose. */
final class RegistrationEmails {

    record Email(String subject, String body) {}

    private RegistrationEmails() {}

    static Email verification(String language, String link) {
        if ("ar".equals(language)) {
            return new Email("تأكيد بريدك الإلكتروني — مكتبتي", """
                    السلام عليكم،

                    لإكمال إنشاء حسابك في «مكتبتي»، افتح الرابط التالي:
                    %s

                    ينتهي هذا الرابط خلال ٢٤ ساعة، ولا يُستخدم إلا مرة واحدة.
                    إن لم تطلب إنشاء حساب، فتجاهل هذه الرسالة.
                    """.formatted(link));
        }
        return new Email("Confirm your email — My Library", """
                Assalamu alaykum,

                To finish creating your My Library account, open this link:
                %s

                The link expires in 24 hours and can only be used once.
                If you didn't ask to create an account, you can ignore this email.
                """.formatted(link));
    }

    static Email alreadyRegistered(String language) {
        if ("ar".equals(language)) {
            return new Email("محاولة تسجيل بعنوان بريدك — مكتبتي", """
                    السلام عليكم،

                    حاول أحدهم إنشاء حساب في «مكتبتي» بعنوان بريدك الإلكتروني، ولديك حساب بالفعل.
                    إن كنت أنت، فسجّل الدخول، أو أعد تعيين كلمة المرور إن نسيتها.
                    إن لم تكن أنت، فلا داعي لأي إجراء: لم يتغيّر شيء في حسابك.
                    """);
        }
        return new Email("Someone tried to register with your email — My Library", """
                Assalamu alaykum,

                Someone tried to create a My Library account with your email address, but you already have one.
                If it was you, sign in, or reset your password if you've forgotten it.
                If it wasn't you, there's nothing to do: nothing about your account has changed.
                """);
    }
}
