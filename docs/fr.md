# Pushbullet

## Présentation

Cette intégration envoie les notifications de Gladys sous forme de pushes
[Pushbullet](https://www.pushbullet.com), vers les téléphones, ordinateurs et
navigateurs où Pushbullet est installé. Chaque utilisateur de Gladys saisit
l'e-mail de son compte Pushbullet ; l'administrateur saisit une seule fois le
jeton d'accès d'un compte Pushbullet pour la maison. Une image de caméra jointe
par Gladys arrive en image.

Elle apporte aussi :

- trois **déclencheurs de scène** : push reçu, notification du téléphone (une
  notification Android recopiée par Pushbullet), push non envoyé ;
- deux **actions de scène** : envoyer un push Pushbullet (note ou lien, vers
  n'importe quelle cible), envoyer un SMS via un téléphone Android ;
- deux **widgets de tableau de bord** : le compte et les pushes reçus.

![Les deux widgets de l'intégration : le compte Pushbullet avec ses pushes du mois, et les derniers pushes et notifications reçus (illustration générée, pas une capture d'écran)](https://raw.githubusercontent.com/William-De71/gladys-pushbullet/main/docs/assets/widgets.fr.png)

Transport : **cloud**. Le texte des notifications, les pushes reçus et, s'ils
sont activés, les notifications recopiées passent par les serveurs de
Pushbullet (`api.pushbullet.com`, `stream.pushbullet.com`).

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent.
- Un compte Pushbullet et l'application Pushbullet sur les appareils qui
  doivent recevoir les notifications (Android, iPhone, Windows, extensions de
  navigateur).
- Un compte gratuit envoie **500 pushes par mois**, toutes applications et
  services confondus ; Pushbullet Pro lève la limite. Les comptes gratuits ont
  aussi une limite mensuelle de SMS.
- Facultatif : un téléphone **Android** avec l'application Pushbullet, pour
  envoyer des SMS et recopier ses notifications.

## Configuration

1. Sur [pushbullet.com](https://www.pushbullet.com/#settings/account), ouvrez
   **Settings → Account** et cliquez sur **Create Access Token**. Le jeton
   commence par `o.`.
2. Dans Gladys, ouvrez **Intégrations → Pushbullet → Configuration**, collez
   le jeton et enregistrez.
3. Cliquez sur **Tester la connexion** : le compte, ses appareils et les
   téléphones capables d'envoyer des SMS s'affichent. **Envoyer un push de
   test** vérifie toute la chaîne.
4. Chaque utilisateur ouvre le bloc **Mon compte** du même écran et saisit
   l'**e-mail de son compte Pushbullet** (et, s'il le souhaite, un de ses
   appareils).

| Champ                                       | Rôle                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Jeton d'accès                               | Depuis Pushbullet → Settings → Account, stocké chiffré                                         |
| Titre des notifications                     | Affiché au-dessus de chaque message de Gladys (`Gladys` par défaut)                            |
| Langue du push de test                      | La langue du push de test (anglais par défaut)                                                 |
| Ajouter un appareil « Gladys »              | Ajoute un appareil nommé « Gladys » au compte (activé par défaut)                              |
| Nom de l'appareil                           | Utilisé à la création de l'appareil (`Gladys` par défaut)                                      |
| Pushes reçus                                | Déclenche « Push reçu » pour chaque nouveau push (activé par défaut)                           |
| Notifications recopiées                     | Déclenche « Notification du téléphone » pour chaque notification Android (désactivé)           |
| Mot de passe du chiffrement de bout en bout | Seulement si le chiffrement est activé dans les applications Pushbullet : le même              |
| Mon compte → e-mail                         | Par utilisateur : le compte Pushbullet de ses notifications                                    |
| Mon compte → appareil                       | Par utilisateur, facultatif : un appareil, seulement si l'e-mail est celui du compte de Gladys |

Le jeton donne un accès complet au compte Pushbullet. L'intégration se
contente d'envoyer des pushes et des SMS, de lire les pushes reçus et
d'ajouter l'appareil « Gladys ».

## Utilisation

### Notifications

Chaque notification de Gladys adressée à un utilisateur qui a saisi un e-mail
part en push : alarmes, actions de scène « Envoyer un message », réponses de
Gladys.

- Si l'e-mail est celui du compte du jeton, le push va à tous ses appareils,
  ou à l'appareil du bloc « Mon compte ».
- Un autre e-mail : le push va à cet utilisateur de Pushbullet ; si l'adresse
  n'a pas de compte Pushbullet, Pushbullet envoie un e-mail à la place.
- Une image jointe au message (action de scène « Envoyer une image de
  caméra ») est téléversée et arrive en image.

### L'appareil « Gladys »

L'intégration ajoute un appareil nommé **Gladys** au compte. Envoyez-lui un
push (depuis le menu Partager de votre téléphone, ou depuis l'application
Pushbullet) pour parler à vos scènes sans déranger vos autres appareils. Les
pushes de Gladys l'affichent comme origine. Désactiver l'option ne le supprime
pas : retirez-le dans Pushbullet. Pour le renommer, renommez-le dans
Pushbullet.

### Déclencheurs de scène

| Déclencheur               | Quand il se déclenche                                                                                                      | Variables                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Push reçu                 | Chaque nouveau push sur le compte, sauf ceux de Gladys ; filtres : destination, provenance, premier mot, expéditeur, genre | titre, texte, lien, nom du fichier, premier mot, genre, provenance, destination, expéditeur, appareil, date |
| Notification du téléphone | Chaque notification recopiée par un téléphone Android ; filtres : application, téléphone, premier mot                      | application, paquet, titre, texte, premier mot, téléphone, date                                             |
| Push non envoyé           | Le premier échec d'une notification, puis à nouveau seulement après un push réussi (jamais de boucle)                      | raison, statut HTTP, erreur, e-mail masqué                                                                  |

Le premier mot est en majuscules sans accents : un push intitulé « Garage
ouvert » donne `GARAGE`. Un push de plus de 15 minutes retrouvé après une
interruption ne déclenche jamais rien, et les pushes déjà présents sur le
compte au démarrage de la réception sont ignorés.

**Un autre utilisateur de Pushbullet peut pousser vers votre e-mail** : avant
d'ouvrir une porte ou de désarmer une alarme, filtrez sur la provenance « Un
de mes appareils » ou sur votre propre e-mail d'expéditeur.

### Actions de scène

- **Envoyer un push Pushbullet** : un titre, un texte et, si besoin, un lien ;
  vers tous les appareils du compte, un appareil (par son nom), une autre
  personne (par son e-mail) ou un canal qui vous appartient. Renvoie
  l'identifiant du push et la cible.
- **Envoyer un SMS via Pushbullet** : un ou plusieurs numéros et un texte.
  Votre téléphone Android l'envoie avec son propre forfait dès qu'il se
  synchronise ; Pushbullet l'annule au bout d'une heure. Renvoie l'identifiant
  du SMS et le téléphone.

### Exemples de scènes

- _Quand un push commençant par GARAGE arrive sur l'appareil « Gladys » depuis
  un de mes appareils_ → fermer la porte du garage.
- _Quand le téléphone affiche une notification de l'application de
  livraison_ → allumer la lumière de l'entrée.
- _Quand l'alarme se déclenche_ → envoyer un push avec un lien vers le tableau
  de bord des caméras, et un SMS au voisin.

### Widgets de tableau de bord

- **Pushbullet** : les pushes envoyés par Gladys ce mois-ci (orange dès 400,
  rouge dès 500, la limite gratuite), les pushes et notifications reçus, les
  appareils, l'état du compte et du lien temps réel, l'appareil « Gladys »,
  les SMS du mois, le dernier échec, et un bouton **Envoyer un test**.
- **Pushes reçus** : les derniers pushes et notifications du téléphone ;
  touchez-en un pour le lire en entier.

## Dépannage

- **« Pushbullet refuse le jeton d'accès »** : le jeton est mal saisi ou a été
  révoqué (Pushbullet → Settings → Account). Créez-en un nouveau et collez-le.
- **« Limite mensuelle de pushes atteinte »** : le compte gratuit a envoyé 500
  pushes ce mois-ci (toutes applications confondues). Attendez le mois
  suivant ou passez à Pushbullet Pro.
- **« Appareil, e-mail ou canal inconnu »** : vérifiez le nom de l'appareil
  dans Pushbullet (« Tester la connexion » les liste). Un appareil ne peut être
  choisi que si l'e-mail est celui du compte du jeton.
- **Rien n'est reçu** : vérifiez que « Pushes reçus » est activé et que la
  ligne « Temps réel » du widget indique « à l'écoute ». Les pushes envoyés par
  Gladys ne déclenchent jamais rien.
- **Aucune notification du téléphone** : activez la recopie des notifications
  dans l'application Pushbullet du téléphone, et « Notifications recopiées »
  dans la configuration. Avec le chiffrement de bout en bout, saisissez le
  même mot de passe.
- **SMS non envoyé** : le téléphone doit être allumé, connecté, et autoriser
  Pushbullet à tourner en arrière-plan.
- **Journaux** : Intégrations → Pushbullet → onglet Supervision. Les adresses
  e-mail sont masquées ; le jeton n'apparaît jamais.
