import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ServerContainerViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

private enum ServerPreferences {
    static let key = "candidatureHub.serverURL"

    static var savedURL: URL? {
        guard let value = UserDefaults.standard.string(forKey: key) else { return nil }
        return URL(string: value)
    }

    static func normalize(_ value: String) -> URL? {
        var candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !candidate.isEmpty else { return nil }
        if !candidate.lowercased().hasPrefix("http://") && !candidate.lowercased().hasPrefix("https://") {
            candidate = "http://\(candidate)"
        }
        while candidate.hasSuffix("/") { candidate.removeLast() }
        guard let url = URL(string: candidate),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil else { return nil }
        return url
    }

    static func save(_ url: URL) {
        UserDefaults.standard.set(url.absoluteString, forKey: key)
    }
}

private final class ConfigurableBridgeViewController: CAPBridgeViewController {
    private let configuredServerURL: URL?

    init(serverURL: URL?) {
        configuredServerURL = serverURL
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        configuredServerURL = ServerPreferences.savedURL
        super.init(coder: coder)
    }

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let configuredServerURL {
            descriptor.serverURL = configuredServerURL.absoluteString
        }
        if let hostname = configuredServerURL?.host {
            descriptor.allowedNavigationHostnames = [hostname]
        }
        return descriptor
    }
}

private final class ServerContainerViewController: UIViewController {
    private var bridgeViewController: ConfigurableBridgeViewController?
    private let settingsButton = UIButton(type: .system)
    private let activityIndicator = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.961, green: 0.949, blue: 0.925, alpha: 1)
        installBridge(for: ServerPreferences.savedURL)
        configureSettingsButton()

        if ServerPreferences.savedURL == nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                self?.showServerSettings()
            }
        }
    }

    private func installBridge(for serverURL: URL?) {
        if let current = bridgeViewController {
            current.willMove(toParent: nil)
            current.view.removeFromSuperview()
            current.removeFromParent()
        }

        let bridge = ConfigurableBridgeViewController(serverURL: serverURL)
        addChild(bridge)
        bridge.view.translatesAutoresizingMaskIntoConstraints = false
        view.insertSubview(bridge.view, at: 0)
        NSLayoutConstraint.activate([
            bridge.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridge.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bridge.view.topAnchor.constraint(equalTo: view.topAnchor),
            bridge.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        bridge.didMove(toParent: self)
        bridgeViewController = bridge
    }

    private func configureSettingsButton() {
        var configuration = UIButton.Configuration.filled()
        configuration.title = "Server"
        configuration.image = UIImage(systemName: "gearshape.fill")
        configuration.imagePadding = 7
        configuration.baseForegroundColor = UIColor(red: 0.251, green: 0.325, blue: 0.416, alpha: 1)
        configuration.baseBackgroundColor = UIColor(white: 1, alpha: 0.96)
        configuration.cornerStyle = .capsule
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
        settingsButton.configuration = configuration
        settingsButton.layer.shadowColor = UIColor.black.cgColor
        settingsButton.layer.shadowOpacity = 0.16
        settingsButton.layer.shadowRadius = 10
        settingsButton.layer.shadowOffset = CGSize(width: 0, height: 4)
        settingsButton.accessibilityLabel = "Impostazioni server"
        settingsButton.addTarget(self, action: #selector(showServerSettings), for: .touchUpInside)
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(settingsButton)

        activityIndicator.hidesWhenStopped = true
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activityIndicator)

        NSLayoutConstraint.activate([
            settingsButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -18),
            settingsButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18),
            settingsButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    @objc private func showServerSettings() {
        let alert = UIAlertController(
            title: "Server Candidature Hub",
            message: "Inserisci l’indirizzo del server, ad esempio 192.168.0.37:3031.",
            preferredStyle: .alert
        )
        alert.addTextField { field in
            field.text = ServerPreferences.savedURL?.absoluteString
            field.placeholder = "http://server-azienda:3031"
            field.keyboardType = .URL
            field.autocapitalizationType = .none
            field.autocorrectionType = .no
            field.clearButtonMode = .whileEditing
        }
        alert.addAction(UIAlertAction(title: "Annulla", style: .cancel))
        alert.addAction(UIAlertAction(title: "Verifica e connetti", style: .default) { [weak self, weak alert] _ in
            guard let value = alert?.textFields?.first?.text,
                  let url = ServerPreferences.normalize(value) else {
                self?.showMessage(title: "Indirizzo non valido", message: "Usa un indirizzo come 192.168.0.37:3031 oppure https://server.azienda.it.")
                return
            }
            self?.testAndConnect(to: url)
        })
        present(alert, animated: true)
    }

    private func testAndConnect(to url: URL) {
        settingsButton.isEnabled = false
        activityIndicator.startAnimating()
        var request = URLRequest(url: url.appendingPathComponent("login"))
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.settingsButton.isEnabled = true
                self.activityIndicator.stopAnimating()

                if error == nil, let http = response as? HTTPURLResponse, (200...499).contains(http.statusCode) {
                    ServerPreferences.save(url)
                    self.installBridge(for: url)
                    self.view.bringSubviewToFront(self.settingsButton)
                    self.view.bringSubviewToFront(self.activityIndicator)
                } else {
                    self.showConnectionError(for: url, error: error)
                }
            }
        }.resume()
    }

    private func showConnectionError(for url: URL, error: Error?) {
        let detail = error?.localizedDescription ?? "Il server non ha risposto."
        let alert = UIAlertController(
            title: "Server non raggiungibile",
            message: "\(url.absoluteString)\n\n\(detail)\n\nControlla Wi-Fi, indirizzo e porta.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Modifica", style: .cancel) { [weak self] _ in
            self?.showServerSettings()
        })
        alert.addAction(UIAlertAction(title: "Salva comunque", style: .default) { [weak self] _ in
            ServerPreferences.save(url)
            self?.installBridge(for: url)
            if let button = self?.settingsButton { self?.view.bringSubviewToFront(button) }
        })
        present(alert, animated: true)
    }

    private func showMessage(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
